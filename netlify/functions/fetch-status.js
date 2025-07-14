// このプログラムはNetlifyのサーバー上で動きます。
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const iconv = require('iconv-lite');

// 運航状況を判定するヘルパー関数
const getStatusInfo = (text) => {
    if (text.includes('欠航') || text.includes('運休')) return { statusText: '欠航/運休', statusType: 'suspended' };
    if (text.includes('条件付') || text.includes('注意') || text.includes('変更')) return { statusText: '注意/変更あり', statusType: 'caution' };
    if (text.includes('通常運航')) return { statusText: '通常運航', statusType: 'normal' };
    if (text.includes('確認ください') || text.includes('確定')) return { statusText: '要確認', statusType: 'check' };
    return { statusText: '情報あり', statusType: 'unknown' };
};

// メインの処理
exports.handler = async (event, context) => {
    // ユーザーが発見した、真のソースページのURL
    const targetUrl = 'http://www.norimono-info.com/group_main.php?type=ship&lang=';

    try {
        // ステップ1: 目的のページに直接アクセスします。もう回り道は不要です！
        const response = await fetch(targetUrl, {
            headers: {
                // 一般的なブラウザからのアクセスに見せかけるための偽装は続けます
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
            }
        });

        if (!response.ok) {
            throw new Error(`情報元サイトへのアクセスに失敗しました (Status: ${response.status})`);
        }

        // ステップ2: HTMLを正しくデコードし、解析します。
        const buffer = await response.buffer();
        const html = iconv.decode(buffer, 'Shift_JIS');

        const $ = cheerio.load(html);
        const allCompanyElements = $('b');
        const gotoKeywords = ['野母商船', '五島産業汽船', '九州商船', '木口汽船', '黄島海運', '五島旅客船', '嵯峨島旅客船'];
        const ferryInfo = [];

        allCompanyElements.each((i, elem) => {
            const companyName = $(elem).text().trim();
            if (gotoKeywords.some(keyword => companyName.includes(keyword))) {
                const table = $(elem).closest('table');
                if (table.length) {
                    let details = table.text().replace(companyName, '').trim();
                    const { statusText, statusType } = getStatusInfo(details);
                    ferryInfo.push({ company: companyName, statusText, statusType, details });
                }
            }
        });
        
        // ステップ3: 見つけた情報を返します。
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ferryInfo,
                timestamp: new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
            }),
        };

    } catch (error) {
        console.error('Function failed:', error);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: `サーバー内部でエラーが発生しました: ${error.message}` }),
        };
    }
};
