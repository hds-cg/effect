let img;
let letterPoints = [];
let endPoints = [];
let colors = [];
let maxLength = 100;
let curvature = 2.0;
let noiseStrength = 1.0;
let num = 1.0; // Z 轴缩放
let step = 8;   // 检测图像的步长
let change = false;
let frameRateValue = 24; // 限制帧率
let pixelDataCache = null;
let maxPoints = 5000; // 添加最大点数限制

function preload() {
    createEmptyImage();
}

function createEmptyImage() {
    img = createImage(windowHeight * 0.75, windowHeight);
    // 使用缓存来存储像素数据
    let cachedPixels;
    
    img.loadPixels();
    if (!cachedPixels) {
        cachedPixels = new Uint8ClampedArray(img.pixels.length);
        for (let i = 0; i < img.pixels.length; i += 4) {
            cachedPixels[i] = 255;     // R
            cachedPixels[i + 1] = 255; // G
            cachedPixels[i + 2] = 255; // B
            cachedPixels[i + 3] = 255; // A
        }
    }
    img.pixels.set(cachedPixels);
    img.updatePixels();
}

function setup() {
    // 修改为正确的 ID
    let controls = document.getElementById('controls');
    let controlsWidth = controls ? controls.offsetWidth : 280; // 添加默认值
    
    let canvas = createCanvas(windowWidth - controlsWidth, windowHeight, WEBGL);
    canvas.parent('canvas-container');
    
    // 设置画布属性
    let ctx = canvas.elt.getContext('2d', { willReadFrequently: true });
    
    pixelDensity(1);
    frameRate(frameRateValue); // 设置帧率
    colorMode(HSB, 360, 100, 100);
    detectLetterPoints();
    generateFuzzyLines();

    document.getElementById("uploadImage").addEventListener("change", handleFile);
    // 为每个滑动条添加数值更新监听
    document.getElementById("lengthSlider").addEventListener("input", (e) => {
        maxLength = parseInt(e.target.value);
        document.getElementById("lengthValue").textContent = maxLength; // 新增数值显示
        generateFuzzyLines();
    });

    document.getElementById("curveSlider").addEventListener("input", (e) => {
        curvature = parseFloat(e.target.value).toFixed(1); // 保留一位小数
        document.getElementById("curveValue").textContent = curvature;
        generateFuzzyLines(); // 新增生成模糊线条
    });

    document.getElementById("noiseSlider").addEventListener("input", (e) => {
        noiseStrength = parseFloat(e.target.value).toFixed(1);
        document.getElementById("noiseValue").textContent = noiseStrength;
        generateFuzzyLines(); // 新增生成模糊线条
    });

    document.getElementById("zSlider").addEventListener("input", (e) => {
        num = parseFloat(e.target.value).toFixed(1);
        document.getElementById("zValue").textContent = num;
        detectLetterPoints();
        generateFuzzyLines();
    });
}

function draw() {
    background(0, 0 , 100);
    
    // 调整坐标系统
    push();
    // 将原点移到画布中心
    translate(0, 0, 0);
    // 添加一些旋转动画
    let angle = sin(frameCount * 0.05) * PI;
    rotateY(angle);
    
    drawFuzzyBezierWithOffset();
    pop();
}

// 删除重复的 handleFile 函数定义，整合代码
function handleFile(event) {
    const status = document.getElementById('uploadStatus');
    const originalText = status.textContent;
    
    status.classList.add('loading');
    status.textContent = '加载中...';

    let file = event.target.files[0];
    if (file && file.type.match('image.*')) {
        let reader = new FileReader(); // 在这里定义 reader
        reader.onload = function(e) {
            loadImage(e.target.result, 
                // 成功回调
                (loadedImg) => {
                    img = loadedImg;
                    pixelDataCache = null; // 清除缓存
                    img.resize(600, 800);
                    
                    // 添加图像处理缓存
                    img.loadPixels();
                    pixelDataCache = new Uint8ClampedArray(img.pixels);
                    
                    detectLetterPoints();
                    generateFuzzyLines();
                    status.classList.remove('loading');
                    status.textContent = '上传成功';
                    setTimeout(() => status.textContent = originalText, 2000);
                },
                // 错误回调
                (error) => {
                    console.error('Image loading error:', error);
                    status.classList.remove('loading');
                    status.textContent = '图片加载失败';
                    setTimeout(() => status.textContent = originalText, 2000);
                }
            );
        };
        reader.onerror = (error) => {
            console.error('FileReader error:', error);
            status.classList.remove('loading');
            status.textContent = '上传失败';
            setTimeout(() => status.textContent = originalText, 2000);
        };
        reader.readAsDataURL(file);
    } else {
        status.classList.remove('loading');
        status.textContent = '请选择有效的图片文件';
        setTimeout(() => status.textContent = originalText, 2000);
    }
}

// 修改 detectLetterPoints 函数以使用缓存
// 修改 detectLetterPoints 函数的采样计算
function detectLetterPoints() {
    letterPoints = [];
    
    // 使用缓存的像素数据
    const pixels = pixelDataCache || img.pixels;
    
    // 重新设计采样步长计算
    const totalPixels = img.width * img.height;
    const baseSamplingRate = Math.sqrt(totalPixels / maxPoints);
    let samplingStep = Math.max(4, Math.min(20, Math.floor(baseSamplingRate))); // 限制步长范围
    
    // 添加采样计数器
    let sampledPoints = 0;
    let threshold = 90; // 初始阈值
    
    // 第一次扫描
    for (let x = 0; x < img.width; x += samplingStep) {
        for (let y = 0; y < img.height; y += samplingStep) {
            let index = (x + y * img.width) * 4;
            let brightnessVal = (pixels[index] + pixels[index + 1] + pixels[index + 2]) / 3;
            
            if (brightnessVal < threshold) {
                // 修改起点的 z 轴计算，使用 num 作为深度控制
                let z = random(num * -50, num * 50);
                let xPos = x - img.width/2;
                let yPos = y - img.height/2;
                letterPoints.push(createVector(xPos, yPos, z));
                sampledPoints++;
            }
            
            // 如果采样点太少，动态调整阈值和步长
            if (y === img.height - samplingStep && x === img.width - samplingStep) {
                if (sampledPoints < maxPoints * 0.1) { // 如果点数太少
                    threshold += 20; // 提高阈值
                    samplingStep = Math.max(2, samplingStep - 2); // 减小步长
                    x = 0; // 重新扫描
                    y = 0;
                    letterPoints = []; // 清空当前点
                    sampledPoints = 0;
                }
            }
        }
    }
    
    // 如果点数仍然太少，进行第二次更密集的扫描
    if (letterPoints.length < maxPoints * 0.1) {
        samplingStep = 2; // 使用最小步长
        threshold = 150; // 使用更高的阈值
        
        for (let x = 0; x < img.width; x += samplingStep) {
            for (let y = 0; y < img.height; y += samplingStep) {
                if (letterPoints.length >= maxPoints) break;
                
                let index = (x + y * img.width) * 4;
                let brightnessVal = (pixels[index] + pixels[index + 1] + pixels[index + 2]) / 3;
                
                if (brightnessVal < threshold) {
                    let z = random(num * -50, num * 50);
                    let xPos = x - img.width/2;
                    let yPos = y - img.height/2;
                    letterPoints.push(createVector(xPos, yPos, z));
                }
            }
            if (letterPoints.length >= maxPoints) break;
        }
    }
    
    console.log(`Generated ${letterPoints.length} points with step ${samplingStep}`);
}

// 优化 generateFuzzyLines 函数
function generateFuzzyLines() {
    // 清除旧的端点
    endPoints = [];
    
    // 使用 forEach 替代 for...of 循环提高性能
    letterPoints.forEach(start => {
        let angle = random(TWO_PI);
        let len = random(10, maxLength);
        let x2 = start.x + cos(angle) * len;
        let y2 = start.y + sin(angle) * len;
        
        // 修改终点的 z 轴计算，同样使用 num 作为深度控制
        let zOffset = random(-maxLength, maxLength);
        let z2 = start.z + zOffset;
        // 确保 z 值在合理范围内
        // z2 = constrain(z2, -50 * num, 50 * num);
        
        endPoints.push(createVector(x2, y2, z2));
    });
}

function drawFuzzyBezierWithOffset() {
    stroke(0, 150);
    strokeWeight(0.5); // 线条宽度
    for (let i = 0; i < letterPoints.length; i++) {
        let start = letterPoints[i];
        let end = endPoints[i];
        
        let n1x = noise(i * 0.02) * 2 - 1;
        let n1y = noise(i * 0.02 + 100) * 2 - 1;
        let n1z = noise(i * 0.02 + 200) * 2 - 1;
        let control1 = createVector(
            start.x + (end.x - start.x) * 0.3 + n1x * curvature * 20,
            start.y + (end.y - start.y) * 0.3 + n1y * curvature * 20,
            start.z + (end.z - start.z) * 0.3 + n1z * curvature * 20
        );

        let n2x = noise(i * 0.02 + 300) * 2 - 1;
        let n2y = noise(i * 0.02 + 400) * 2 - 1;
        let n2z = noise(i * 0.02 + 500) * 2 - 1;
        let control2 = createVector(
            start.x + (end.x - start.x) * 0.7 + n2x * curvature * 20,
            start.y + (end.y - start.y) * 0.7 + n2y * curvature * 20,
            start.z + (end.z - start.z) * 0.7 + n2z * curvature * 20
        );

        noFill();
        bezier(
            start.x, start.y, start.z,
            control1.x, control1.y, control1.z,
            control2.x, control2.y, control2.z,
            end.x, end.y, end.z
        );
        push();
        translate(start.x, start.y, start.z);
        fill(0);
        ellipse(0, 0, 2, 2);
        pop();
    }
}

// 添加窗口大小改变的响应
function windowResized() {
    resizeCanvas(windowWidth - 280, windowHeight);
}