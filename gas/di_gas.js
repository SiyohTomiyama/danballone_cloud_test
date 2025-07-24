const SOURCE_COLUMN_TEMPLATE = 14; // O列 商品番号(型番)
const SOURCE_COLUMN_FIRST_ORDER = 4; // E列 初回注文番号
const TEMPLATE_URL_COLUMN = 12; // M列 テンプレートファイルai
const FIRST_ORDER_URL_COLUMN = 13; // N列 初回注文が入ったフォルダ
const START_ROW = 5; // データは6行目から
const TEMPLATE_FOLDER_ID = '1350fFFcbHtZnIv6OtgJiGkYAJJ5qRaCP'; // テンプレートファイルの親フォルダID
const FIRST_ORDER_FOLDER_IDS = [ // 初回注文フォルダ
    '1jVx_lxlsSkYC7_RaGxqBGKqn7ahe-M8f',  // 保管データ_2023.10.12以降
    '1gsg9Y5fBK9MwJ6Prvdjx1EayIfwrX3yY',  // == 2024/6/以前 （A式フルオーダー）==
    '1S-g742wTUXN7FDiR-SNfel_W1JUdKlQX', // == 2023/10/11以前（商品別）==
    '0AOWcq-i71BUUUk9PVA'  // 2025年8月以降使う予定の初回注文フォルダ サブフォルダができてきたら、それぞれのIDにする
];
const BASE_URL_FILE = "https://drive.google.com/file/d/"; //ファイル用
const BASE_URL_FOLDER = "https://drive.google.com/drive/folders/"; //フォルダ用

// onOpen：スプシが開いた時に呼ばれる関数。メニューの登録
function onOpen() {
    const ui = SpreadsheetApp.getUi();
    const menu = ui.createMenu('スクリプト実行');
    menu.addItem('URL取得', 'getUrl');
    menu.addToUi();
}

// テンプレートファイル、初回注文フォルダのURLを取得し、数式が入っていないところを埋める
function getUrl() {
    //準備
    const sheet = SpreadsheetApp.getActiveSheet();
    const lastRow = sheet.getLastRow();

    // N列までのデータを値として取得
    let fullData = sheet.getRange(1, 1, lastRow, FIRST_ORDER_URL_COLUMN + 1).getValues();

    //数式だけで値のないセルも付いてくるので、下の方の空白行はトリミングする
    let actualDataEndRow = fullData.length; // actualDataEndRowは絶対行番号指定
    for (let i = fullData.length - 1; i >= START_ROW; i--) {
        let al_blank = true; //AからLがすべて空白
        for (let j = 0; j <= 11; j++) { //L列のインデックスは11
            //AからLまですべて空白であることをチェックする
            if (fullData[i][j] != "") {
                al_blank = false;
                break; //セルが一つでも埋まっていたら、そこを最終行とみなす
            }
        }
        if (al_blank) {
            actualDataEndRow = i;
            // インデックスiの行とそれより下の行はA-Lが空白
            // 絶対行番号actualDataEndRow（インデックスはi-1）はまだ空白かどうかわからない
        } else {
            break; // A-Lに空白でない行が見つかったので、トリミングを停止
        }
    }
    // fullDataを実際のデータ終了行までトリムする
    fullData = fullData.slice(0, actualDataEndRow);

    // 書き込み用の二次元配列を書き込む列数に合わせて初期化
    let urlToWrite = Array(fullData.length).fill(null).map(() => Array(2).fill("")); //URL書き込み用

    for (let i = START_ROW; i < fullData.length; i++) {
        const originalSheetRow = i + 1; // ログがわかりやすいように絶対行番号を使う
        const rowData = fullData[i]; // 現在処理中の行データ

        // URL 現在の行の値を保持
        let templateUrl = rowData[TEMPLATE_URL_COLUMN] || "";
        let firstOrderUrl = rowData[FIRST_ORDER_URL_COLUMN] || "";

        // テンプレートファイル検索 (テンプレートファイル名があってURLがない場合のみ実行)
        if (rowData[SOURCE_COLUMN_TEMPLATE] && !templateUrl) {
            // ファイル名は完全一致検索
            const fullFileName = String(rowData[SOURCE_COLUMN_TEMPLATE]).trim();
            console.log(`Processing row ${originalSheetRow}. Searching for template file: "${fullFileName}"`);

            // 高速化のためDrive APIを使用してファイル検索
            let file = searchDriveByApi(TEMPLATE_FOLDER_ID, fullFileName, false); // ファイル検索

            if (file) {
                templateUrl = BASE_URL_FILE + file.id; // Drive APIの戻り値はid
            } else {
                templateUrl = "見つからないよ";
                console.warn(`Template file "${fullFileName}" not found for row ${originalSheetRow}.`);
            }
        }

        // 初回注文フォルダ検索 (初回注文番号があってURLがない場合)
        if (rowData[SOURCE_COLUMN_FIRST_ORDER] && !firstOrderUrl) {
            const folderNamePrefix = String(rowData[SOURCE_COLUMN_FIRST_ORDER]).trim(); // フォルダ名は部分一致
            console.log(`Processing row ${originalSheetRow}. Searching for first order folder: "${folderNamePrefix}"`);

            let folder = null;
            // フォルダIDの配列をループして検索
            for (const folderId of FIRST_ORDER_FOLDER_IDS) {
                folder = searchDriveByApi(folderId, folderNamePrefix, true); // フォルダ名で検索
                if (folder) {
                    console.log(`Folder found in ID: ${folderId}`);
                    break;
                }
                console.log(`Folder not found in ID: ${folderId}. Trying next.`); // デバッグ用
            }

            if (folder) {
                firstOrderUrl = BASE_URL_FOLDER + folder.id;
            } else {
                firstOrderUrl = "見つからないよ";
                console.warn(`First order folder "${folderNamePrefix}" not found for row ${originalSheetRow}.`);
            }
        }

        // URL書き込み用の配列
        urlToWrite[i] = [templateUrl, firstOrderUrl];
    }

    // スプレッドシートに書き込む
    writeDataValues(urlToWrite, START_ROW + 1, TEMPLATE_URL_COLUMN + 1, 2);
    SpreadsheetApp.flush(); // スプレッドシートへの変更を即時反映
}

// スプレッドシートに書き込む関数
// values: 書き込むデータの配列
// startRow: 書き込み開始行
// targetColumn: 書き込み開始列
// numColumn: 書き込む列数
function writeDataValues(values, startRow, targetColumn, numColumn) {
    // startRowより上のデータは捨てる
    values = values.slice(startRow - 1);
    console.log("Writing values:", values);
    const sheet = SpreadsheetApp.getActiveSheet();

    // getRange(行の開始, 列の開始, 行数, 列数)
    sheet.getRange(startRow, targetColumn, values.length, numColumn).setValues(values);
}

// folderId: 検索対象の親フォルダID
// name: 検索対象の名前 (ファイル名の場合は完全一致、フォルダ名の場合は前方一致の接頭辞)
// isFolderSearch: trueならフォルダ検索、falseならファイル検索
function searchDriveByApi(folderId, name, isFolderSearch) {
    try {
        const folder = DriveApp.getFolderById(folderId);
        switch (folderId) {
            case '1jVx_lxlsSkYC7_RaGxqBGKqn7ahe-M8f':
                //保管データ_2023.10.12以降フォルダは第一階層しか見ない
                //第二階層まで見に行くと、数分の時間ロスになる
                return searchItemsRecursiveApi(folder, name, isFolderSearch, false);
                break;
            default:
                return searchItemsRecursiveApi(folder, name, isFolderSearch, true);
                break;
        }
    } catch (e) {
        console.error(`Error accessing folder ID: ${folderId}, Error: ${e.message}`);
        return null;
    }
}

// depthSearchはより下の階層まで見るかどうか
function searchItemsRecursiveApi(folder, nameToSearch, isFolderSearch, depthSearch) {

    let query; //検索用クエリ
    let foundItem = null;

    const currentFolderId = folder.getId(); // 探索対象の親フォルダID

    if (isFolderSearch) {
        query = `name contains '${nameToSearch}' and mimeType = 'application/vnd.google-apps.folder' and '${currentFolderId}' in parents and trashed = false`;
    } else { // ファイル名で完全一致検索 (AIファイル)
        // AIファイルのmimeTypeはおpostscriptかpdfで、指定しても効果を感じられない
        query = `name = '${nameToSearch}' and '${currentFolderId}' in parents and trashed = false`;
    }

    try {
        const response = Drive.Files.list({
            q: query,
            fields: 'files(id, name)',
            pageSize: 1000, //これくらいのサイズの方が検索が速いらしい
            supportsAllDrives: true,     // 共有ドライブの検索に必要
            includeItemsFromAllDrives: true // 本来Drive API V2のものだが、こうしないと検索できないので
        });

        if (response.files && response.files.length > 0) {
            //フォルダ名のパターン
            //★の後に注文番号_顧客名
            //上記の★なし
            //上記の顧客名なし
            //最初に見つかったもので良しとする
            const folderNameRegex = new RegExp(`^(?:★)?${nameToSearch}.*$`);
            for (const item of response.files) {
                if (isFolderSearch) {
                    if (folderNameRegex.test(item.name)) {
                        foundItem = item;
                        break;
                    }
                } else {
                    foundItem = item;
                    break;
                }
            }
        }
    } catch (e) {
        console.error(`Error searching with Drive API in folder ${folder.getName()} (ID: ${currentFolderId}): ${e.message}`);
    }

    if (foundItem) {
        console.log(`Found ${isFolderSearch ? 'folder' : 'file'}: ${foundItem.name} (ID: ${foundItem.id}) in folder: ${folder.getName()}`);
        return foundItem;
    }

    //depthSearchがtrueか、ファイル検索ならひとつ下の階層を検索する
    if (depthSearch && isFolderSearch || !isFolderSearch) {
        let subFolders = folder.getFolders();
        while (subFolders.hasNext()) {
            let subFolder = subFolders.next();
            let foundItemInSub = searchItemsRecursiveApi(subFolder, nameToSearch, isFolderSearch, false);
            if (foundItemInSub) {
                return foundItemInSub;
            }
        }
    } else {
        return null;
    }

    return null;
}
