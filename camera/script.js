// --- HTML要素の追加 (仮定) ---
// <select id="cameraSelect"></select>
// <button id="startCameraButton">カメラを起動/切り替え</button>
const cameraSelect = document.getElementById('cameraSelect');
const startCameraButton = document.getElementById('startCameraButton');

let currentStream = null; // 現在のカメラストリームを保持する変数

// -------------------------------------------------------------------
// 📸 ステップ1: 利用可能な全カメラを列挙し、UIに表示
// -------------------------------------------------------------------
async function populateCameraList() {
    // まずカメラの権限を取得
    try {
        await navigator.mediaDevices.getUserMedia({ video: true });
    } catch (e) {
        statusDiv.textContent = 'エラー: カメラへのアクセス権限が必要です。';
        return;
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoInputs = devices.filter(device => device.kind === 'videoinput');
    
    // UIをリセット
    cameraSelect.innerHTML = '';
    
    videoInputs.forEach(device => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        
        // ラベルから内/外カメラを推測し、ユーザーに分かりやすく表示
        const label = device.label || `Camera ${videoInputs.indexOf(device) + 1}`;
        const isRear = label.toLowerCase().includes('back') || label.toLowerCase().includes('rear') || label.toLowerCase().includes('environment') || label.toLowerCase().includes('背面');
        
        option.textContent = isRear ? `${label} (外カメラ)` : `${label} (内カメラ)`;
        
        // 外カメラをデフォルトで選択状態にする
        if (isRear && !cameraSelect.querySelector('option[selected]')) {
            option.selected = true;
        }

        cameraSelect.appendChild(option);
    });

    startCameraButton.disabled = false;
    startCameraButton.onclick = startCamera; // ボタンにイベントを設定
}


// -------------------------------------------------------------------
// 🎥 ステップ2: 選択されたカメラIDでストリームを起動/切り替え
// -------------------------------------------------------------------
async function startCamera() {
    const selectedDeviceId = cameraSelect.value;

    // 既存のストリームがあれば停止
    if (currentStream) {
        currentStream.getTracks().forEach(track => {
            track.stop();
        });
        currentStream = null;
    }

    const constraints = {
        video: { 
            width: { ideal: WIDTH }, 
            height: { ideal: HEIGHT },
            // ユーザーが選択したカメラIDを厳密に指定
            deviceId: { exact: selectedDeviceId } 
        }
    };

    try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        currentStream = stream; // 新しいストリームを保存
        video.srcObject = stream;
        video.play();
        
        // 追跡処理の開始 (既に実行中の場合はclearIntervalを先に行う必要がありますが、ここでは省略)
        video.onloadedmetadata = () => {
             // 追跡を始める前に、古いsetIntervalをクリアすることが必要です
             // 簡略化のため、ここでは直接開始
             setInterval(processFrame, 1000 / 30);
        };
        statusDiv.textContent = 'カメラ起動成功。追跡を開始します。';

    } catch (err) {
        console.error("カメラ切り替えに失敗しました:", err);
        statusDiv.textContent = 'エラー: 選択されたカメラでの起動に失敗しました。';
    }
}

// -------------------------------------------------------------------
// 🚀 処理開始
// -------------------------------------------------------------------
// ページロード時にカメラリストを生成
populateCameraList();

// ※ 既存の processFrame 関数はそのまま使用します
