const functions = require('@google-cloud/functions-framework');
const { google } = require("googleapis");
// 書き込みたいスプレッドシートのID
const SHEET_ID = "1N9rdwS3Pe5ZxVufNIAv3UX83m6EhFvkmQfLHKH7W9jQ";
const TARGET_SHEET_NAME = "from_ops"; // 操作したいシート名
const KEY_LINE_NO = 2; //キーが入っている行

functions.http('appendSpreadSheetRow', async (req, res) => { // async を追加
    try {
        const today = new Date();
        const jwt = getJwt();

        // n行目のデータ（ヘッダー行）を取得
        const headerRow = await getSpecifiedRowData(jwt, SHEET_ID, TARGET_SHEET_NAME, KEY_LINE_NO);
        if (!headerRow || headerRow.length === 0) {
            return res.status(400).send(`Error: Sheet '${TARGET_SHEET_NAME}'のキーリスト行にデータがありません`);
        }

        // req.body のキーとヘッダーを比較し、書き込むデータと未発見キーを準備
        const dataToWrite = new Array(headerRow.length).fill(''); // 書き込む行の初期化（空文字で埋める）
        const missingKeys = []; // シートに見つからなかったキーを格納

        // req.rawBody を Buffer から文字列に変換してログ出力
        const rawBodyAsString = req.rawBody ? req.rawBody.toString('utf8') : 'No raw body received.';
        console.log("Received raw body:", rawBodyAsString);
        // 無効なJSONの場合はパースエラーで関数が呼ばれる前に終了する。
        // JSONとしてパースされた後の型チェックを行う
        if (typeof req.body !== 'object' || req.body === null) {
            return res.status(400).send('Error: リクエストボディはJSONオブジェクトでなければなりません。');
        }

        const bodyKeys = Object.keys(req.body);

        for (const key of bodyKeys) {
            const headerIndex = headerRow.indexOf(key); // ヘッダー行にキーが存在するか検索
            if (headerIndex !== -1) {
                // キーがヘッダーに見つかった場合、対応する列に値を設定
                dataToWrite[headerIndex] = req.body[key];
            } else {
                // キーがヘッダーに見つからなかった場合
                missingKeys.push(key);
            }
        }

        // 未発見のキーがあったらエラーレスポンスを返す
        if (missingKeys.length > 0) {
            return res.status(400).send(`Error: キーリストに含まれないキーがあったため処理は行われませんでした: ${missingKeys.join(', ')}`);
        }

        //最初のセルは日付で埋める
        dataToWrite[0] = today.getFullYear() + "/" + toTwoDigits(today.getMonth() + 1) + "/" + toTwoDigits(today.getDate());

        // データが存在する最初の空白行を見つける
        // range を "A1" とすることで append メソッドが自動で最初の空白行を探してくれる
        const appendRange = `${TARGET_SHEET_NAME}!A1`;

        // データをスプレッドシートに書き込む
        await appendSheetRowAsync(jwt, SHEET_ID, appendRange, dataToWrite);

        res.status(200).send(`OK: '${TARGET_SHEET_NAME}'に正常に書き込みが行われました`);

    } catch (error) {
        console.error("Error in appendSpreadSheetRow (main function):", error);
        res.status(500).send(`Error: An internal server error occurred. Details: ${error.message || error.toString()}`);
    }
}, { rawBody: true });

//二桁の数字にする
function toTwoDigits(number) {
    return number.toString().padStart(2, '0');
}

// JWTクライアントを取得する関数（既存）
function getJwt() {
    console.log("===getJwt start===");
    var credentials = require("./credentials.json");
    return new google.auth.JWT(
        credentials.client_email,
        null,
        credentials.private_key,
        ['https://www.googleapis.com/auth/spreadsheets']
    );
}

/**
 * 指定されたシートのkeyLineNo行目のデータを取得する関数
 * @returns {Promise<Array<string>>} keyLineNo行目のデータ（文字列配列）、または空の配列
 */
async function getSpecifiedRowData(jwt, spreadsheetId, sheetName, keyLineNo) {
    const sheets = google.sheets({ version: 'v4', auth: jwt });
    const range = `${sheetName}!${keyLineNo}:${keyLineNo}`; // keyLineNo行目全体を指定
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: spreadsheetId,
            range: range,
        });
        return response.data.values && response.data.values.length > 0 ? response.data.values[0] : [];
    } catch (err) {
        console.error(`キーの一覧を取得できませんでした '${sheetName}':`, err);
        throw err;
    }
}

/**
 * スプレッドシートに行を追記する非同期関数
 * @param {object} jwt - 認証されたJWTクライアント
 * @param {string} spreadsheetId - スプレッドシートのID
 * @param {string} range - データを追記する範囲（例: "Sheet1!A1"）
 * @param {Array<string>} row - 追記するデータの配列
 * @returns {Promise<object>} APIレスポンスのPromise
 */
function appendSheetRowAsync(jwt, spreadsheetId, range, row) {
    return new Promise((resolve, reject) => {
        const sheets = google.sheets({ version: 'v4', auth: jwt });
        sheets.spreadsheets.values.append({
            spreadsheetId: spreadsheetId,
            range: range,
            auth: jwt,
            valueInputOption: 'USER_ENTERED', //セルの書式設定に従う
            resource: { values: [row] }
        }, function (err, result) {
            if (err) {
                console.error("データを追加する際エラーが出ました:", err);
                reject(err);
            } else {
                console.log('Updated sheet: ' + result.data.updates.updatedRange);
                resolve(result);
            }
        });
    });
}
