export const roles = [
    {
        key: "5",
        rank: "5",
        name: "スキップ",
        description: "出した枚数分、手番を飛ばす"
    },
    {
        key: "7",
        rank: "7",
        name: "7渡し",
        description: "次の人に手札を渡す"
    },
    {
        key: "8",
        rank: "8",
        name: "ヤギリ",
        description: "場を流してもう一度出す"
    },
    {
        key: "9",
        rank: "9",
        name: "栗拾い",
        description: "捨て札からカードを拾う"
    },
    {
        key: "10",
        rank: "10",
        name: "10捨て",
        description: "手札からカードを捨てる"
    },
    {
        key: "J",
        rank: "J",
        name: "イレブンバック",
        description: "場が流れるまで強さを逆転"
    },
    {
        key: "Q",
        rank: "Q",
        name: "12ボンバー",
        description: "指定した数字を全員の手札から除外"
    },
    {
        key: "K",
        rank: "K",
        name: "スキップ",
        description: "出した枚数分、手番を飛ばす"
    },
    {
        key: "revolution",
        rank: "4+",
        name: "革命",
        description: "同じ数字を4枚以上出すと強さが逆転"
    }
];
export const defaultSettings = Object.fromEntries(roles.map((role)=>[
        role.key,
        true
    ]));
export const maxPlayers = 8;
export const turnSeconds = 30;
export const nineModes = [
    { value: "pickup", label: "栗拾い" },
    { value: "reverse", label: "9リバース" },
    { value: "off", label: "効果なし" },
];

export function placeName(place, total) {
    if (place === 1) return "大富豪";
    if (place === total) return "大貧民";
    if (place === 2 && total >= 4) return "富豪";
    if (place === total - 1 && total >= 4) return "貧民";
    return "平民";
}
