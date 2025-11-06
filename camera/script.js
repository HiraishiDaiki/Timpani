// --- 追跡に必要な変数 (グローバルスコープに追加) ---
let previousFrameData = null; 
let rearCameraId = null; // 外カメラのIDを保持するための変数

// ... (既存のWIDTH, HEIGHT, THRESHOLDの設定などはそのまま) ...

// --- ステップ1: 外カメラのIDを特定する関数 ---
async function getRearCameraId() {
    // 権限を確実にするため、一度ユーザーにカメラアクセスを求めます
    try {
        await navigator.mediaDevices.getUserMedia({ video: true }); 
    } catch (e) {
        // ユーザーがここで拒否した場合、デバイスリストは取得できません
        console.warn("カメラ権限が拒否されました。", e);
        return;
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoInputs = devices.filter(device => device.kind === 'videoinput');
    
    // ラベルと facingMode から外カメラを特定しようと試みる
    const rearCamera = videoInputs.find(device => {
        const label = device.label.toLowerCase();
        
        // ラベルに「back」や「rear」などのキーワードが含まれるかチェック
        const isRearLabel = label.includes('back') || label.includes('rear') || label.includes('environment') || label.includes('背面');
        
        // 拡張情報（ブラウザ依存）に facingMode: 'environment' が含まれるかチェック
        // 注: device.getCapabilities() で確認できる場合もありますが、ここではラベルを優先
        
        return isRearLabel;
    });

    if (rearCamera) {
        rearCameraId = rearCamera.deviceId;
        console.log("特定された外カメラID:", rearCameraId, "ラベル:", rearCamera.label);
    } else {
        // ラベルから特定できない場合、デバイスリストの2番目を試す（内カメラの次であることが多いため）
        if (videoInputs.length > 1) {
            rearCameraId = videoInputs[1].deviceId;
            console.log("ラベルで特定できず、リストの2番目を試行:", videoInputs[1].label);
        } else if (videoInputs.length > 0) {
            // カメラが1つしかない場合、それを設定（通常は内カメラだが、外カメラしかないスマホもある）
            rearCameraId = videoInputs[0].deviceId;
        }
    }
}

// --- ステップ2: カメラのセットアップ (deviceIdで指定する修正版) ---
async function setupCamera() {
    // まず外カメラのIDを特定するのを待つ
    await getRearCameraId(); 
    
    let constraints;

    if (rearCameraId) {
        // IDが特定できた場合、deviceIdで厳密に指定
        constraints = {
            video: { 
                width: WIDTH, 
                height: HEIGHT,
                // deviceIdで厳密に指定する
                deviceId: { exact: rearCameraId }
            }
        };
    } else {
        // IDが特定できない場合、facingMode: 'environment'を理想値として設定 (保険)
        constraints = {
            video: { 
                width: WIDTH, 
                height: HEIGHT,
                facingMode: { ideal: 'environment' }
            }
        };
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        video.play();
        
        // カメラ映像の読み込み完了後、処理を開始
        video.onloadedmetadata = () => {
            // processFrame関数は既存のものを使用
            setInterval(processFrame, 1000 / 30); 
        };
    } catch (err) {
        console.error("カメラへのアクセスまたは指定デバイスでの起動に失敗しました:", err);
        statusDiv.textContent = 'エラー: 指定されたカメラでの起動に失敗しました。facingModeを試します...';
        
        // 最後の手段として、facingModeのみで再試行
        if (!rearCameraId) {
             const fallbackConstraints = {
                 video: { width: WIDTH, height: HEIGHT, facingMode: 'environment' }
             };
             // 再試行のロジックは煩雑になるため省略しますが、ここではエラーメッセージの表示に留めます
        }
    }
}

// 処理開始
setupCamera();

// ... (既存の processFrame 関数はそのまま) ...
