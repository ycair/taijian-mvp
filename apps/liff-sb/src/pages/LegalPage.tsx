import { Link } from 'react-router-dom';

function LegalHeader() {
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true">苔</div>
        <div>
          <div className="brand-name">苔間</div>
          <div className="brand-sub">把每一次照顧，留在同一個家</div>
        </div>
      </div>
      <span className="line-pill">Demo</span>
    </header>
  );
}

const privacy = [
  ['我們收集什麼', 'LINE/Google 登入識別、顯示名稱與頭像、家庭與居民資料、照護紀錄、提醒、Journal 照片與你主動公開的內容。'],
  ['用途', '提供家庭共享照護、提醒、Journal、公開/連結分享與 sandbox 商店功能；不用於出售個人資料。'],
  ['保存與分享', '資料存放在 Supabase；只有家庭成員能讀取家庭資料。Journal 只有你選擇「連結」或「公開」時才會提供外部讀取。'],
  ['你的選擇', '可修改顯示名稱、刪除 Journal、取消公開，或在設定中刪除帳號；公開連結失效後不再提供該篇內容。'],
  ['示範性質', '苔間目前是 demo，尚未完成正式法務與個資政策審閱；請勿上傳敏感或未經同意的照片。'],
];

const terms = [
  ['服務範圍', '苔間提供爬寵與特殊寵物的家庭照護紀錄、提醒與 Journal。目前是 demo，不保證永久可用或資料不遺失。'],
  ['不是醫療建議', '照護資訊與提醒不取代獸醫診斷或專業建議；緊急狀況請尋求獸醫協助。'],
  ['帳號與家庭', '你必須有權邀請家庭成員並分享居民資料。請勿未經同意上傳他人的照片或個人資料。'],
  ['公開內容', '公開 Journal 會讓任何取得連結的人閱讀；請自行確認照片、文字與居民資訊可以公開。'],
  ['Sandbox 商店', '商店/點數/訂閱是 sandbox，不會實際扣款、出貨或開通 App Store 訂閱。'],
];

export function PrivacyPage() {
  return (
    <div className="shell">
      <LegalHeader />
      <main className="app">
        <div className="kicker">Privacy</div>
        <h1 className="h1">隱私權說明</h1>
        <p className="muted">最後更新：2026-10-27 · Demo 版本</p>
        {privacy.map(([title, body]) => (
          <section className="card" style={{ marginTop: 14 }} key={title}>
            <h2 style={{ fontSize: 16, marginTop: 0 }}>{title}</h2>
            <p style={{ lineHeight: 1.7, marginBottom: 0 }}>{body}</p>
          </section>
        ))}
        <div style={{ marginTop: 18 }}>
          <Link to="/terms" className="btn-ghost">服務條款 →</Link>
          <Link to="/" className="btn-ghost">回到苔間 →</Link>
        </div>
      </main>
    </div>
  );
}

export function TermsPage() {
  return (
    <div className="shell">
      <LegalHeader />
      <main className="app">
        <div className="kicker">Terms</div>
        <h1 className="h1">服務條款</h1>
        <p className="muted">最後更新：2026-10-27 · Demo 版本</p>
        {terms.map(([title, body]) => (
          <section className="card" style={{ marginTop: 14 }} key={title}>
            <h2 style={{ fontSize: 16, marginTop: 0 }}>{title}</h2>
            <p style={{ lineHeight: 1.7, marginBottom: 0 }}>{body}</p>
          </section>
        ))}
        <div style={{ marginTop: 18 }}>
          <Link to="/privacy" className="btn-ghost">隱私權說明 →</Link>
          <Link to="/" className="btn-ghost">回到苔間 →</Link>
        </div>
      </main>
    </div>
  );
}
