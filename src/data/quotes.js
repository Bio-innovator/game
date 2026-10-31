export const QUOTES = {
  philosophy: [
    { id: "wilde-stars", text: "我们都在阴沟里，但仍有人仰望星空。", author: "奥斯卡·王尔德" },
    { id: "bacon-knowledge", text: "知识就是力量。", author: "弗朗西斯·培根" },
    { id: "nietzsche-stronger", text: "凡不能毁灭我的，必使我更强大。", author: "弗里德里希·尼采" },
  ],
  scifi: [
    { id: "clarke-magic", text: "任何足够先进的科技，都与魔法无异。", author: "阿瑟·克拉克" },
    { id: "haldane-universe", text: "宇宙不仅比我们想象的更奇特，而且比我们能够想象的更奇特。", author: "J. B. S. 霍尔丹" },
    { id: "armstrong-step", text: "这是个人的一小步，却是人类的一大步。", author: "尼尔·阿姆斯特朗" },
  ],
  engineering: [
    { id: "anonymous-first", text: "先让它运转，再让它更好。", author: "佚名" },
    { id: "anonymous-network", text: "网络的价值，来自每一段愿意维持的连接。", author: "佚名" },
  ],
};

export function getQuote(quoteId) {
  for (const quotes of Object.values(QUOTES)) {
    const quote = quotes.find((item) => item.id === quoteId);
    if (quote) return quote;
  }
  return QUOTES.engineering[0];
}
