// ==========================================
// グローバル変数
// ==========================================
let audioContext;
let analyserL, analyserR; // リサージュ用（フィルタ後）
let analyserSpectrumL,analyserSpectrumR;     // スペクトル用（フィルタ前・生音）

const ampHistoryPower = []; // 二乗和の履歴

let startTime = 0;
const resetTime = 5;

let currentSweap = [];
let previousSweep = [];

let filterL, filterR;
let filterLh,filterRh;
let dataArrayL, dataArrayR;
let delayNodeL, delayNodeR;

// スペクトル表示用の変数
let freqDataArrayL,freqDataArrayR; 
let freqBufferLengthL,freqBufferLengthR;

let animationId;
let isRunning = false;

// 設定値
let targetFreq = 135;
let bandwidth = 0;
let visualGain = 1.0; 

// スペクトル表示の上限周波数 (Hz)
const MAX_DISPLAY_FREQ = 1000;

// 減衰曲線のモードと履歴配列
let decayMode = 'combined'; // 'combined' か 'separate' が入る
let autoStopAtEdge = false;
let currentSweepCombined = [];
let previousSweepCombined = [];
let currentSweepL = [];
let previousSweepL = [];
let currentSweepR = [];
let previousSweepR = [];

// ==========================================
// DOM要素
// ==========================================
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

const freqCanvasL = document.getElementById('frequencyCanvasL');
const freqCtxL = freqCanvasL.getContext('2d');
// Canvas解像度設定
// freqCanvasL.width = 600;
// freqCanvasL.height = 200;

const freqCanvasR = document.getElementById('frequencyCanvasR');
const freqCtxR = freqCanvasR.getContext('2d');
// Canvas解像度設定
// freqCanvasR.width = 600;
// freqCanvasR.height = 200;


const ampCanvasL = document.getElementById('ampCanvasL');
const ampCtxL = ampCanvasL ? ampCanvasL.getContext('2d') : null;

const ampCanvasR = document.getElementById('ampCanvasR');
const ampCtxR = ampCanvasR ? ampCanvasR.getContext('2d') : null;

const decayCombinedContainer = document.getElementById('decayCombinedContainer');
const decaySeparateContainer = document.getElementById('decaySeparateContainer');


const startBtn = document.getElementById('startBtn');
const statusDiv = document.getElementById('status');
const audioSelect = document.getElementById('audioSource');

const freqInput = document.getElementById('freqInput');
const bwInput = document.getElementById('bwInput');
const gainInput = document.getElementById('gainInput');

const ampCanvas = document.getElementById('ampCanvas');
const ampCtx = ampCanvas ? ampCanvas.getContext('2d') : null;

const delayInput = document.getElementById('delayInput');
const delayValueDisplay = document.getElementById('delayValue');

// ==========================================
// 0. デバイス一覧の取得
// ==========================================
async function getAudioDevices() {
    try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(device => device.kind === 'audioinput');

        audioSelect.innerHTML = '';
        audioInputs.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.text = device.label || `Microphone ${audioSelect.length + 1}`;
            audioSelect.appendChild(option);
        });
        
        statusDiv.textContent = "デバイスを選択して開始してください";
    } catch (e) {
        console.error(e);
        statusDiv.textContent = "マイクへのアクセスを許可してください";
    }
}
getAudioDevices();

// ==========================================
// 1. マイク入力のセットアップ
// ==========================================
async function setupAudio() {
    try {
        // 画面クリア
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        freqCtxL.fillStyle = '#ffffff';
        freqCtxL.fillRect(0, 0, freqCanvasL.width, freqCanvasL.height);
        freqCtxR.fillStyle = '#ffffff';
        freqCtxR.fillRect(0, 0, freqCanvasR.width, freqCanvasR.height);

        audioContext = new (window.AudioContext || window.webkitAudioContext)();

        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                deviceId: audioSelect.value ? { exact: audioSelect.value } : undefined,
                echoCancellation: false,
                autoGainControl: false,
                noiseSuppression: false,
                channelCount: 2 
            }
        });

        const source = audioContext.createMediaStreamSource(stream);
        const splitter = audioContext.createChannelSplitter(2);
        source.connect(splitter);

        // --- フィルタ作成 ---
        filterL = createLowpassFilter(); //createBandpassFilter();
        filterR = createLowpassFilter();//createBandpassFilter();
        filterLh = createHighpassFilter();
        filterRh = createHighpassFilter();

        // --- 遅延ノードの作成 ---
        delayNodeL = audioContext.createDelay(1.0);
        delayNodeR = audioContext.createDelay(1.0);
        

        // --- アナライザ作成 ---
        // 1. リサージュ用 (フィルタ後の音を見る)
        analyserL = audioContext.createAnalyser();
        analyserR = audioContext.createAnalyser();
        analyserL.fftSize = 32768 / 8; 
        analyserR.fftSize = 32768 / 8;
        analyserL.smoothingTimeConstant = 0; 
        analyserR.smoothingTimeConstant = 0;

        // 2. スペクトル用 (フィルタ前の「生音」)
        analyserSpectrumL = audioContext.createAnalyser();
        analyserSpectrumL.fftSize = 4096 * 4;
        analyserSpectrumL.smoothingTimeConstant = 0.0;

        analyserSpectrumR = audioContext.createAnalyser();
        analyserSpectrumR.fftSize = 4096 * 4;
        analyserSpectrumR.smoothingTimeConstant = 0.0;

        // --- 接続ルーティング ---
        
        // A. スペクトル用: Splitter(生の音) -> AnalyserSpectrum
        // マイク1(ch0)の生音を接続
        splitter.connect(analyserSpectrumL, 0);
        splitter.connect(analyserSpectrumR, 1);

        // B. リサージュ用: Splitter -> Filter -> AnalyserL/R
        splitter.connect(delayNodeL,0);
        splitter.connect(delayNodeR,1);

        delayNodeL.connect(filterL); 
        delayNodeR.connect(filterR); 

        filterL.connect(filterLh);
        filterR.connect(filterRh);

        filterLh.connect(analyserL);
        filterRh.connect(analyserR);


        // データ配列の準備
        // リサージュ用
        const bufferLength = analyserL.frequencyBinCount;
        dataArrayL = new Float32Array(bufferLength);
        dataArrayR = new Float32Array(bufferLength);

        // スペクトル用
        freqBufferLengthL = analyserSpectrumL.frequencyBinCount;
        freqDataArrayL = new Uint8Array(freqBufferLengthL);

        freqBufferLengthR = analyserSpectrumL.frequencyBinCount;
        freqDataArrayR = new Uint8Array(freqBufferLengthR);

        updateFilters();
        statusDiv.textContent = "モニタリング中... ";
        startBtn.textContent = "停止";
        isRunning = true;

        // スタート時に減衰曲線のリセットを行う。
        startTime = Date.now();
        currentSweepCombined = [];
        previousSweepCombined = [];
        currentSweepL = [];
        previousSweepL = [];
        currentSweepR = [];
        previousSweepR = [];
        
        draw(); 

    } catch (err) {
        console.error(err);
        statusDiv.textContent = "エラー: マイクへのアクセスが拒否されたか、デバイスが見つかりません。";
    }
}

function createLowpassFilter(){
    const filter = audioContext.createBiquadFilter();
    filter.type = "lowpass";
    return filter;
}

function createHighpassFilter(){
    const filter = audioContext.createBiquadFilter();
    filter.type = "highpass";
    return filter;
}

// function createBandpassFilter() {
//     const filter = audioContext.createBiquadFilter();
//     filter.type = "bandpass";
//     return filter;
// }

function updateFilters() {
    if (!filterL || !filterR) return;

    const safeBw = 1; //Math.max(1, bandwidth);
    const qValue = 20; //targetFreq / safeBw;
    const currentTime = audioContext.currentTime;
    
    filterL.frequency.setTargetAtTime(targetFreq + bandwidth / 2, currentTime, 0.01);
    filterL.Q.setTargetAtTime(qValue, currentTime, 0.01);
    filterLh.frequency.setTargetAtTime(targetFreq - bandwidth / 2, currentTime, 0.01);
    filterLh.Q.setTargetAtTime(qValue, currentTime, 0.01);
    
    filterR.frequency.setTargetAtTime(targetFreq + bandwidth / 2, currentTime, 0.01);
    filterR.Q.setTargetAtTime(qValue, currentTime, 0.01);
    filterRh.frequency.setTargetAtTime(targetFreq - bandwidth / 2, currentTime, 0.01);
    filterRh.Q.setTargetAtTime(qValue, currentTime, 0.01);

    // const safeBw = Math.max(1, bandwidth);
    // const qValue = targetFreq / safeBw;
    // const currentTime = audioContext.currentTime;
    
    // filterL.frequency.setTargetAtTime(targetFreq, currentTime, 0.01);
    // filterL.Q.setTargetAtTime(qValue, currentTime, 0.01);
    
    // filterR.frequency.setTargetAtTime(targetFreq, currentTime, 0.01);
    // filterR.Q.setTargetAtTime(qValue, currentTime, 0.01);
}

// 遅延ノードの時間を更新する関数
// --- 遅延ノードの時間を更新する関数 ---
function updateDelay() {
    // 1. まず、スライダーの値を取得して画面の表示（数値）だけを更新する
    const offsetMs = Number(delayInput.value);
    if (delayValueDisplay) {
        delayValueDisplay.textContent = offsetMs.toFixed(1);
    }

    // 2. もしマイクがスタートしていない（audioContext等が無い）場合は、ここで処理を止める
    if (!audioContext || !delayNodeL || !delayNodeR) {
        return; 
    }

    // 3. マイク動作中であれば、遅延を適用する
    const currentTime = audioContext.currentTime;

    // offsetがプラスならLを遅延、マイナスならRを遅延させる
    if (offsetMs > 0) {
        delayNodeL.delayTime.setTargetAtTime(offsetMs / 1000.0, currentTime, 0.01);
        delayNodeR.delayTime.setTargetAtTime(0, currentTime, 0.01);
    } else {
        delayNodeL.delayTime.setTargetAtTime(0, currentTime, 0.01);
        delayNodeR.delayTime.setTargetAtTime(Math.abs(offsetMs) / 1000.0, currentTime, 0.01);
    }
}
// ==========================================
// 2. 描画ループ
// ==========================================
function draw() {
    if (!isRunning) return;
    animationId = requestAnimationFrame(draw);

    // --- 1. リサージュ図形の描画 (フィルタ後の音) ---
    const width = canvas.width;
    const height = canvas.height;
    const cx = width / 2;
    const cy = height / 2;

    ctx.fillStyle = '#ffffff'; 
    ctx.fillRect(0, 0, width, height);

    analyserL.getFloatTimeDomainData(dataArrayL);
    analyserR.getFloatTimeDomainData(dataArrayR);

    ctx.lineWidth = 2;
    ctx.strokeStyle = '#000000'; 
    ctx.beginPath();

    const len = dataArrayL.length;
    const scale = (width / 2) * visualGain;

    for (let i = 0; i < len; i++) {
        const x = cx + dataArrayL[i] * scale;
        const y = cy - dataArrayR[i] * scale; 

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();


    // --- 2. スペクトル（周波数分析）の描画 (フィルタ前の生音) ---
    const fw = freqCanvasL.width;
    const fh = freqCanvasL.height;

    freqCtxL.fillStyle = '#f0f0f0';
    freqCtxL.fillRect(0, 0, fw, fh);

    freqCtxR.fillStyle = '#f0f0f0';
    freqCtxR.fillRect(0, 0, fw, fh);

    // 生音用のアナライザからデータを取得
    analyserSpectrumL.getByteFrequencyData(freqDataArrayL);
    analyserSpectrumR.getByteFrequencyData(freqDataArrayR);


    // 二次関数によるピーク周波数（(1,1)モード）の推定
    const nyquist = audioContext.sampleRate / 2;
    const searchMinIdx = Math.floor((60 / nyquist) * freqBufferLengthL);
    const searchMaxIdx = Math.floor((300 / nyquist) * freqBufferLengthL);

    let firstindexL = 0, maxValL = -1;
    let firstindexR = 0, maxValR = -1;

    // ① LとRそれぞれで一番高い場所（ピーク）を探す
    for (let i = searchMinIdx; i <= searchMaxIdx; i++) {
        // 左マイク(L)のピーク探索
        if (freqDataArrayL[i] > maxValL) {
            maxValL = freqDataArrayL[i];
            firstindexL = i;
        }
        // 右マイク(R)のピーク探索
        if (freqDataArrayR[i] > maxValR) {
            maxValR = freqDataArrayR[i];
            firstindexR = i;
        }
    }

    // 二次関数補間を行う関数
    function getPeakFreq(index, maxV, dataArray, bufferLen, sRate, fSize) {
        if (index > 0 && index < bufferLen - 1 && maxV > 0) {
            let x1 = index * sRate / fSize;
            let y1 = dataArray[index];
            let x2 = (index - 1) * sRate / fSize;
            let y2 = dataArray[index - 1];
            let x3 = (index + 1) * sRate / fSize;
            let y3 = dataArray[index + 1];

            let denominator = (x1 - x2) * (x1 - x3) * (x2 - x3);
            if (denominator !== 0) {
                let a = (y1 * (x2 - x3) + y2 * (x3 - x1) + y3 * (x1 - x2)) / denominator;
                let b = (y1 * (x3**2 - x2**2) + y2 * (x1**2 - x3**2) + y3 * (x2**2 - x1**2)) / denominator;
                return -b / (2 * a); // 頂点のX座標（周波数）
            }
            return x1;
        }
        return 0;
    }

    // LとRそれぞれのピーク周波数を計算
    let sRate = audioContext.sampleRate;
    let fSize = analyserSpectrumL.fftSize;

    let vertexX_L = getPeakFreq(firstindexL, maxValL, freqDataArrayL, freqBufferLengthL, sRate, fSize);
    let vertexX_R = getPeakFreq(firstindexR, maxValR, freqDataArrayR, freqBufferLengthR, sRate, fSize);
    // ==========================================

    const maxIndex = Math.floor((MAX_DISPLAY_FREQ / nyquist) * freqBufferLengthL);
    const barWidth = fw / maxIndex;

    let x = 0;

    for(let i = 0; i < maxIndex; i++) {
        const barHeightL = freqDataArrayL[i]; 
        const barHeightR = freqDataArrayR[i]; 

        const percentL = barHeightL / 255;
        const hL = percentL * fh;

        const percentR = barHeightR / 255;
        const hR = percentR * fh;

        freqCtxL.fillStyle = `#000000`;
        freqCtxL.fillRect(x, fh - hL, barWidth + 1, hL);
        
        freqCtxR.fillStyle = `#000000`;
        freqCtxR.fillRect(x, fh - hR, barWidth + 1, hR);

        x += barWidth;
    }

   

    
    // ガイドライン（これはフィルタの中心周波数を示す）
    drawFreqGuide(targetFreq);

    if (vertexX_L > 0) {
        freqCtxL.fillStyle = "rgba(0, 0, 0, 1)";
        freqCtxL.font = "bold 16px 'Times New Roman', serif";
        freqCtxL.fillText("L (1,1)mode Peak: " + vertexX_L.toFixed(2) + " Hz", 10, 30);
    }
    if (vertexX_R > 0) {
        freqCtxR.fillStyle = "rgba(0, 0, 0, 1)";
        freqCtxR.font = "bold 16px 'Times New Roman', serif";
        freqCtxR.fillText("R (1,1)mode Peak: " + vertexX_R.toFixed(2) + " Hz", 10, 30);
    }

    // ==========================================
    // --- 3. 振幅（モード切り替え対応）の推移を描画 ---
    // ==========================================
    if (ampCtx) {
        
        const aw = ampCanvas.width;
        const ah = ampCanvas.height;

        ampCtx.fillStyle = '#ffffff';
        ampCtx.fillRect(0,0,aw,ah);

        // ★ targetFreq に対応する FFT のインデックスを計算する
        const nyquist = audioContext.sampleRate / 2;
        // ※スペクトル用アナライザ(analyserSpectrumL)のfftSizeを使用
        const fSize = analyserSpectrumL.fftSize; 
        const targetIndex = Math.floor((targetFreq / nyquist) * (fSize / 2));

        // FFTデータ（0〜255）から、指定周波数の高さを直接取得して 0.0〜1.0 に正規化
        let rawValL = 0;
        let rawValR = 0;
        
        if (targetIndex >= 0 && targetIndex < freqDataArrayL.length) {
            rawValL = freqDataArrayL[targetIndex] / 255.0;
            rawValR = freqDataArrayR[targetIndex] / 255.0;
        }

        // ゲインをかける
        rawValL = Math.min(rawValL * visualGain, 1.0);
        rawValR = Math.min(rawValR * visualGain, 1.0);

        // 【A】二乗和（Combined）の計算：個別の値を二乗して足してルートを取る
        let powerCombined = Math.sqrt((rawValL * rawValL) + (rawValR * rawValR));
        if (powerCombined > 1.0) powerCombined = 1.0;

        // 【B】個別（L / R）の値
        let powerL = rawValL;
        let powerR = rawValR;

        const yPosCombined = ah - (powerCombined * ah);
        const yPosL = ah - (powerL * ah);
        const yPosR = ah - (powerR * ah);

        let elapsedTime = (Date.now() - startTime) / 1000;
        let xPos = (elapsedTime % resetTime ) / resetTime * aw;

        // 画面リセット判定 ＆ Auto Stop 処理
        if(currentSweepCombined.length > 0 && xPos < currentSweepCombined[currentSweepCombined.length - 1][0]){
            if (autoStopAtEdge) {
                if (audioContext) audioContext.close();
                isRunning = false;
                startBtn.textContent = "Start";
                statusDiv.textContent = "Auto Stopped (右端到達)";
                return;
            }
            previousSweepCombined = [...currentSweepCombined];
            previousSweepL = [...currentSweepL];
            previousSweepR = [...currentSweepR];
            currentSweepCombined = [];
            currentSweepL = [];
            currentSweepR = [];
            startTime = Date.now();
            xPos = 0;
        }

        currentSweepCombined.push([xPos, yPosCombined]);
        currentSweepL.push([xPos, yPosL]);
        currentSweepR.push([xPos, yPosR]);

        // ==========================================
        // 描画の分岐（プルダウンの状態に応じて切り替え）
        // ==========================================
        if (decayMode === 'combined') {
            // ▼ 二乗和モード（黒）の描画 ▼
            if (previousSweepCombined.length > 0) {
                ampCtx.beginPath();
                ampCtx.moveTo(previousSweepCombined[0][0], previousSweepCombined[0][1]);
                for (let i = 1; i < previousSweepCombined.length; i++) ampCtx.lineTo(previousSweepCombined[i][0], previousSweepCombined[i][1]);
                ampCtx.strokeStyle = "rgba(51, 51, 51, 0.4)"; 
                ampCtx.lineWidth = 1;
                ampCtx.stroke();
            }
            if (currentSweepCombined.length > 0){
                ampCtx.beginPath();
                ampCtx.moveTo(currentSweepCombined[0][0], currentSweepCombined[0][1]);
                for (let i = 1; i < currentSweepCombined.length; i++) ampCtx.lineTo(currentSweepCombined[i][0], currentSweepCombined[i][1]);
                ampCtx.strokeStyle = "black";
                ampCtx.lineWidth = 2;
                ampCtx.stroke();
            }
            // ampCtx.fillStyle = "rgba(255, 255, 255, 0.8)";
            // ampCtx.fillRect(10, 10, 130, 30);
            // ampCtx.font = "bold 12px Arial";
            // ampCtx.fillStyle = "black";
            // ampCtx.fillText("Combined (L²+R²)", 20, 30);

        } else {
            // ▼ 個別モード（キャンバス分割）の描画 ※履歴コメントアウト中 ▼
            if (ampCtxL && ampCtxR) {
                ampCtxL.fillStyle = '#ffffff'; ampCtxL.fillRect(0, 0, aw, ah);
                ampCtxR.fillStyle = '#ffffff'; ampCtxR.fillRect(0, 0, aw, ah);

                // --- Lのキャンバス描画 ---
                if (currentSweepL.length > 0){
                    ampCtxL.beginPath();
                    ampCtxL.moveTo(currentSweepL[0][0], currentSweepL[0][1]);
                    for (let i = 1; i < currentSweepL.length; i++) ampCtxL.lineTo(currentSweepL[i][0], currentSweepL[i][1]);
                    ampCtxL.strokeStyle = "rgb(0, 0, 0)";
                    ampCtxL.lineWidth = 2;
                    ampCtxL.stroke();
                }
                // ampCtxL.fillStyle = "rgba(255, 255, 255, 0.8)";
                // ampCtxL.fillRect(10, 10, 90, 30);
                // ampCtxL.font = "bold 12px Arial";
                // ampCtxL.fillStyle = "rgb(255, 99, 132)";
                // ampCtxL.fillText("MIC 1 (L)", 20, 30);

                // --- Rのキャンバス描画 ---
                if (currentSweepR.length > 0){
                    ampCtxR.beginPath();
                    ampCtxR.moveTo(currentSweepR[0][0], currentSweepR[0][1]);
                    for (let i = 1; i < currentSweepR.length; i++) ampCtxR.lineTo(currentSweepR[i][0], currentSweepR[i][1]);
                    ampCtxR.strokeStyle = "rgb(0, 0, 0)";
                    ampCtxR.lineWidth = 2;
                    ampCtxR.stroke();
                }
                // ampCtxR.fillStyle = "rgba(255, 255, 255, 0.8)";
                // ampCtxR.fillRect(10, 10, 90, 30);
                // ampCtxR.font = "bold 12px Arial";
                // ampCtxR.fillStyle = "rgb(54, 162, 235)";
                // ampCtxR.fillText("MIC 2 (R)", 20, 30);
            }
        }
    }
}

// ガイドライン表示関数
function drawFreqGuide(freq) {
    if(!audioContext) return;
    if (freq > MAX_DISPLAY_FREQ) return;

    const fw = freqCanvasL.width;
    const fh = freqCanvasL.height;
    const xPos = (freq / MAX_DISPLAY_FREQ) * fw;

    if (xPos < fw) {
        freqCtxL.beginPath();
        freqCtxL.moveTo(xPos, 0);
        freqCtxL.lineTo(xPos, fh);
        freqCtxL.strokeStyle = 'red';
        freqCtxL.lineWidth = 2;
        freqCtxL.setLineDash([5, 5]); 
        freqCtxL.stroke();
        freqCtxL.setLineDash([]); 

        freqCtxL.fillStyle = 'red';
        freqCtxL.font = '12px Arial';
        freqCtxL.fillText(`${freq}Hz`, xPos + 5, 15);

        freqCtxR.beginPath();
        freqCtxR.moveTo(xPos, 0);
        freqCtxR.lineTo(xPos, fh);
        freqCtxR.strokeStyle = 'red';
        freqCtxR.lineWidth = 2;
        freqCtxR.setLineDash([5, 5]); 
        freqCtxR.stroke();
        freqCtxR.setLineDash([]); 

        freqCtxR.fillStyle = 'red';
        freqCtxR.font = '12px Arial';
        freqCtxR.fillText(`${freq}Hz`, xPos + 5, 15);
    }
}

// ==========================================
// 3. UIイベントリスナー
// ==========================================

const decayModeSelect = document.getElementById('decayModeSelect');
if (decayModeSelect) {
    decayModeSelect.addEventListener('change', (e) => {
        decayMode = e.target.value;
        
        // ★ 選択に合わせてコンテナの表示を切り替える
        if (decayMode === 'combined') {
            decayCombinedContainer.style.display = 'block';
            decaySeparateContainer.style.display = 'none';
        } else {
            decayCombinedContainer.style.display = 'none';
            decaySeparateContainer.style.display = 'block';
        }
    });
}


startBtn.addEventListener('click', () => {
    if (isRunning) {
        if (audioContext) audioContext.close();
        cancelAnimationFrame(animationId);
        isRunning = false;
        startBtn.textContent = "マイク入力を開始";
        statusDiv.textContent = "停止";
    } else {
        setupAudio();
    }
});

freqInput.addEventListener('input', (e) => {
    targetFreq = Number(e.target.value);
    updateFilters();
});
bwInput.addEventListener('input', (e) => {
    bandwidth = Number(e.target.value);
    updateFilters();
});
gainInput.addEventListener('input', (e) => {
    visualGain = Number(e.target.value);
});

if (delayInput){
    delayInput.addEventListener('input',updateDelay);
}

const autoStopCheck = document.getElementById('autoStopCheck');
if (autoStopCheck) {
    autoStopCheck.addEventListener('change', (e) => {
        autoStopAtEdge = e.target.checked;
    });
}

// ==========================================
// 画像保存 (即時と0.5秒後の2枚連続保存)
// ==========================================
document.querySelectorAll('.saveBtn').forEach(button => {
    button.addEventListener("click", function() {
        const canvasId = this.getAttribute("data-canvas-id");
        const targetCanvas = document.getElementById(canvasId);
        if (!targetCanvas) return;

        // 画像を生成してダウンロードさせる共通の関数
        const downloadCanvasImage = (suffix) => {
            const dataURL = targetCanvas.toDataURL("image/png");
            const now = new Date();
            const timestamp = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}-${now.getMinutes().toString().padStart(2, '0')}-${now.getSeconds().toString().padStart(2, '0')}`;
            
            const link = document.createElement("a");
            link.href = dataURL;
            // ファイル名が被らないように、最後にsuffix（_0s, _0.5sなど）を付ける
            link.download = `${canvasId}_${timestamp}_${suffix}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        };

        // 1枚目：ボタンを押した「瞬間」に保存
        downloadCanvasImage("0s");

        // 2枚目：0.5秒（500ミリ秒）待ってから保存
        setTimeout(() => {
            downloadCanvasImage("0-3s");
        }, 300);
    });
});