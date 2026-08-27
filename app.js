// ============================================
// cxhkgcxvhhh Aviation enthusiast Club
// 正式上線版本（彩色 HTML 電郵通知＋硬碟資料保存＋封鎖用戶）
// ============================================
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const nodemailer = require('nodemailer');
const exifr = require('exifr');
const app = express();
const PORT = 3000;

// ============================================
// 電郵設定
// ============================================
const GMAIL_USER = 'cxcvaec@gmail.com';
const GMAIL_APP_PASSWORD = 'itmz ahtc mwkq sojd';
const SITE_EMAIL = 'cxcvaec@gmail.com';
const APPEAL_EMAIL = 'cxcvaec@gmail.com';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD }
});

// ============================================
// 📧 彩色 HTML 電郵模板
// ============================================
function buildEmailHtml(options) {
  const color = options.color || '#1976d2';
  const icon = options.icon || '✈️';
  const title = options.title || '';
  const bodyHtml = options.bodyHtml || '';
  const footnote = options.footnote || '';

  return '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f8fc;font-family:\'Microsoft JhengHei\',\'PingFang HK\',Arial,sans-serif;">' +
    '<div style="max-width:560px;margin:0 auto;padding:30px 16px;">' +
    '<div style="background:#fff3cd;border:1px solid #f0d878;border-radius:12px;padding:10px 18px;text-align:center;font-size:13px;color:#8a6d00;font-weight:700;margin-bottom:14px;">⚠️ 此為自動發放郵件，請勿回覆</div>' +
    '<div style="background:linear-gradient(135deg,' + color + ',#1565c0);border-radius:16px 16px 0 0;padding:30px 28px;text-align:center;">' +
      '<div style="font-size:44px;margin-bottom:8px;">' + icon + '</div>' +
      '<div style="color:#ffffff;font-size:22px;font-weight:700;">' + title + '</div>' +
      '<div style="color:rgba(255,255,255,0.85);font-size:13px;margin-top:6px;">cxhkgcxvhhh Aviation enthusiast Club</div>' +
    '</div>' +
    '<div style="background:#ffffff;border:1px solid #e3eaf2;border-top:none;padding:30px 28px;line-height:1.9;color:#34495e;font-size:15px;">' +
      bodyHtml +
    '</div>' +
    '<div style="background:#eef3f8;border:1px solid #e3eaf2;border-top:none;border-radius:0 0 16px 16px;padding:18px 28px;text-align:center;">' +
      (footnote ? '<div style="font-size:12px;color:#5f7285;margin-bottom:8px;">' + footnote + '</div>' : '') +
      '<div style="font-size:12px;color:#8ba0b3;">© ' + new Date().getFullYear() + ' cxhkgcxvhhh Aviation enthusiast Club<br>如有查詢請電郵至 <a href="mailto:' + SITE_EMAIL + '" style="color:#1976d2;">' + SITE_EMAIL + '</a></div>' +
    '</div>' +
    '</div></body></html>';
}

function infoRow(label, value) {
  return '<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #eef3f8;">' +
    '<span style="color:#5f7285;font-size:14px;">' + label + '</span>' +
    '<span style="color:#1a2b3c;font-size:14px;font-weight:600;">' + value + '</span>' +
  '</div>';
}

function sendEmail(to, subject, html) {
  if (!to) return;
  transporter.sendMail({
    from: '"cxhkgcxvhhh Aviation enthusiast Club" <' + GMAIL_USER + '>',
    to: to,
    subject: subject,
    html: html
  }).then(() => {
    console.log('[EMAIL] 已寄出 → ' + to + '：' + subject);
  }).catch(err => {
    console.error('[EMAIL] 寄信失敗：', err.message);
  });
}

// ============================================
// 總管理員（Super Admin）
// ============================================
const SUPER_ADMIN = { name: 'cxhkgcxvhhh', email: 'cxhkgcxvhhh@gmail.com' };

const ADMIN_LIST = [
  { name: 'aec cxcv', email: 'cxcvaec@gmai.com' }
];

// ============================================
// 中間件設定
// ============================================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: 'cxcv-aviation-secret-key-change-me',
  resave: false,
  saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());

// ============================================
// 圖片上傳設定
// ============================================
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'public', 'uploads')),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// ============================================
// 資料儲存（記憶體＋硬碟）
// ============================================
let photos = [];
let news = [];
let photoIdCounter = 1;
let newsIdCounter = 1;
let announcements = [];
let annIdCounter = 1;
let comments = [];
let commentIdCounter = 1;
let loginRecords = [];
let scoreHistory = [];
let deletedPhotos = [];

const activeUsers = new Map();
const onlineAdmins = new Map();
const knownUsers = new Map();

// 管理員名單分兩部分：上面 ADMIN_LIST 係寫死喺 code 嘅基本管理員，
// 而 dynamicAdmins 係總管理員喺網站後加嘅（會存入資料庫，重啟都仲喺度）
let dynamicAdmins = [];

// ============================================
// 💾 資料保存（寫落硬碟 data/database.json，重啟伺服器都唔會冇資料）
// ============================================
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');

// 開機嗰陣讀返之前嘅資料
function loadDB() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      console.log('[DB] 搵唔到資料庫檔案（第一次啟動），由空白開始');
      return;
    }
    const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    photos = db.photos || [];
    news = db.news || [];
    photoIdCounter = db.photoIdCounter || (photos.reduce((m, p) => Math.max(m, p.id || 0), 0) + 1);
    newsIdCounter = db.newsIdCounter || (news.reduce((m, n) => Math.max(m, n.id || 0), 0) + 1);
    announcements = db.announcements || [];
    annIdCounter = db.annIdCounter || (announcements.reduce((m, a) => Math.max(m, a.id || 0), 0) + 1);
    comments = db.comments || [];
    commentIdCounter = db.commentIdCounter || (comments.reduce((m, c) => Math.max(m, c.id || 0), 0) + 1);
    loginRecords = db.loginRecords || [];
    scoreHistory = db.scoreHistory || [];
    deletedPhotos = db.deletedPhotos || [];
    (db.knownUsers || []).forEach(u => knownUsers.set(u.id, u));
    (db.dynamicAdmins || []).forEach(a => {
      if (!ADMIN_LIST.find(x => x.email.toLowerCase() === a.email.toLowerCase())) {
        ADMIN_LIST.push(a);
      }
      dynamicAdmins.push(a);
    });
    console.log('[DB] ✅ 已載入資料庫：' + photos.length + ' 張相片、' + news.length + ' 則新聞、' + knownUsers.size + ' 位用戶、' + dynamicAdmins.length + ' 位後加管理員');
  } catch (err) {
    console.error('[DB] 載入資料庫失敗：', err.message);
  }
}

// 存檔（0.3 秒延遲合併寫入，避免連續動作狂寫硬碟）
let saveTimer = null;
function saveDB() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      const db = {
        photos: photos,
        news: news,
        photoIdCounter: photoIdCounter,
        newsIdCounter: newsIdCounter,
        announcements: announcements,
        annIdCounter: annIdCounter,
        comments: comments,
        commentIdCounter: commentIdCounter,
        loginRecords: loginRecords,
        scoreHistory: scoreHistory,
        deletedPhotos: deletedPhotos,
        knownUsers: [...knownUsers.values()],
        dynamicAdmins: dynamicAdmins
      };
      fs.writeFileSync(DB_FILE, JSON.stringify(db));
      console.log('[DB] 💾 資料已儲存到 data/database.json');
    } catch (err) {
      console.error('[DB] 儲存失敗：', err.message);
    }
  }, 300);
}

// ============================================
// 📬 功能7：待審核積壓通知（超過 10 張先 email 管理員，回落到 10 張或以下會重設）
// ============================================
const PENDING_ALERT_THRESHOLD = 10;
let pendingAlertSent = false;
function checkPendingAlert() {
  const count = photos.filter(p => p.status === 'pending').length;
  if (count <= PENDING_ALERT_THRESHOLD) {
    if (pendingAlertSent) console.log('[ALERT] 待審核數量回落至 ' + count + ' 張，通知已重設');
    pendingAlertSent = false;
    return;
  }
  if (pendingAlertSent) return;
  pendingAlertSent = true;
  const admins = [SUPER_ADMIN, ...ADMIN_LIST];
  admins.forEach(a => {
    sendEmail(
      a.email,
      '⚠️ 待審核相片積壓超過 ' + PENDING_ALERT_THRESHOLD + ' 張（現有 ' + count + ' 張）',
      buildEmailHtml({
        color: '#d97706',
        icon: '🚨',
        title: '待審核相片積壓提醒',
        bodyHtml:
          '<p style="margin:0 0 16px;">而家有 <b>' + count + '</b> 張相片排緊隊等審核，已經超過咗 ' + PENDING_ALERT_THRESHOLD + ' 張嘅上限，請盡快入審核中心處理。</p>' +
          infoRow('📷 待審核數量', count + ' 張') +
          infoRow('⚙️ 通知上限', PENDING_ALERT_THRESHOLD + ' 張') +
          infoRow('🕐 通知時間', new Date().toLocaleString('zh-HK')) +
          '<div style="text-align:center;margin-top:24px;"><a href="http://localhost:3000/admin" style="display:inline-block;background:#d97706;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:24px;font-weight:600;">立即去審核中心</a></div>' +
          '<p style="margin:24px 0 0;font-size:12px;color:#999;">呢封通知喺積壓回落到 ' + PENDING_ALERT_THRESHOLD + ' 張或以下之前唔會再寄出。</p>'
      })
    );
  });
  console.log('[ALERT] 待審核數量 ' + count + ' 張，已通知管理員');
}

loadDB();

const START_SCORE = 3;

setInterval(() => {
  const now = Date.now();
  for (const [id, t] of activeUsers) if (now - t > 10 * 60 * 1000) activeUsers.delete(id);
  for (const [id, t] of onlineAdmins) if (now - t > 10 * 60 * 1000) onlineAdmins.delete(id);
}, 60 * 1000);

function isAdminRole(u) {
  return u && u.role === 'admin';
}

// ============================================
// 航空公司資料庫
// ============================================
const airlineDB = {
  'cx': '國泰航空', 'cathay': '國泰航空', 'cathay pacific': '國泰航空', '國泰': '國泰航空', '國泰航空': '國泰航空',
  'ka': '國泰港龍航空', 'dragonair': '國泰港龍航空', '港龍': '國泰港龍航空',
  'hx': '香港航空', 'hong kong airlines': '香港航空', '香港航空': '香港航空',
  'uo': '香港快運', 'hk express': '香港快運', 'hke': '香港快運', '快運': '香港快運', '香港快運': '香港快運',
  'ca': '中國國際航空', 'air china': '中國國際航空', '國航': '中國國際航空',
  'cz': '中國南方航空', 'china southern': '中國南方航空', '南航': '中國南方航空',
  'mu': '中國東方航空', 'china eastern': '中國東方航空', '東航': '中國東方航空',
  'fm': '上海航空', 'shanghai airlines': '上海航空',
  'mf': '廈門航空', 'xiamen air': '廈門航空', '廈航': '廈門航空',
  'hu': '海南航空', 'hainan airlines': '海南航空', '海航': '海南航空',
  'zh': '深圳航空', 'shenzhen airlines': '深圳航空', '深航': '深圳航空',
  'sc': '山東航空', 'shandong airlines': '山東航空',
  '3u': '四川航空', 'sichuan airlines': '四川航空', '川航': '四川航空',
  'gs': '天津航空', 'tianjin airlines': '天津航空',
  'jd': '首都航空', 'capital airlines': '首都航空',
  '9c': '春秋航空', 'spring airlines': '春秋航空',
  'ho': '吉祥航空', 'juneyao airlines': '吉祥航空',
  'br': '長榮航空', 'eva air': '長榮航空', 'eva': '長榮航空', '長榮': '長榮航空',
  'ci': '中華航空', 'china airlines': '中華航空', '華航': '中華航空',
  'ae': '華信航空', 'mandarin airlines': '華信航空',
  'b7': '立榮航空', 'uni air': '立榮航空',
  'jl': '日本航空', 'japan airlines': '日本航空', 'jal': '日本航空', '日航': '日本航空',
  'nh': '全日本空輸', 'ana': '全日本空輸', 'all nippon': '全日本空輸', '全日空': '全日本空輸',
  'ke': '大韓航空', 'korean air': '大韓航空', '韓航': '大韓航空',
  'oz': '韓亞航空', 'asiana': '韓亞航空', 'asiana airlines': '韓亞航空',
  'sq': '新加坡航空', 'singapore airlines': '新加坡航空', '新航': '新加坡航空',
  'tr': '酷航', 'scoot': '酷航',
  'tg': '泰國國際航空', 'thai airways': '泰國國際航空', '泰航': '泰國國際航空',
  'fd': '泰國亞洲航空', 'thai airasia': '泰國亞洲航空',
  'ak': '亞洲航空', 'airasia': '亞洲航空', '亞航': '亞洲航空',
  'mh': '馬來西亞航空', 'malaysia airlines': '馬來西亞航空', '馬航': '馬來西亞航空',
  'ga': '加魯達印尼航空', 'garuda': '加魯達印尼航空', 'garuda indonesia': '加魯達印尼航空',
  'vn': '越南航空', 'vietnam airlines': '越南航空', '越航': '越南航空',
  'pr': '菲律賓航空', 'philippine airlines': '菲律賓航空', '菲航': '菲律賓航空',
  '5j': '宿霧太平洋航空', 'cebu pacific': '宿霧太平洋航空',
  'qf': '澳洲航空', 'qantas': '澳洲航空', '澳航': '澳洲航空',
  'nz': '紐西蘭航空', 'air new zealand': '紐西蘭航空',
  'fj': '斐濟航空', 'fiji airways': '斐濟航空',
  'ba': '英國航空', 'british airways': '英國航空', '英航': '英國航空',
  'lh': '漢莎航空', 'lufthansa': '漢莎航空', '漢莎': '漢莎航空',
  'af': '法國航空', 'air france': '法國航空', '法航': '法國航空',
  'kl': '荷蘭皇家航空', 'klm': '荷蘭皇家航空', '荷航': '荷蘭皇家航空',
  'lx': '瑞士國際航空', 'swiss': '瑞士國際航空', '瑞航': '瑞士國際航空',
  'os': '奧地利航空', 'austrian airlines': '奧地利航空',
  'sk': '北歐航空', 'sas': '北歐航空', 'scandinavian': '北歐航空',
  'ay': '芬蘭航空', 'finnair': '芬蘭航空', '芬航': '芬蘭航空',
  'ib': '西班牙國家航空', 'iberia': '西班牙國家航空',
  'az': '意大利航空', 'alitalia': '意大利航空', 'ita airways': '意大利ITA航空', 'ity': '意大利ITA航空',
  'tp': '葡萄牙航空', 'tap portugal': '葡萄牙航空',
  'ei': '愛爾蘭航空', 'aer lingus': '愛爾蘭航空',
  'vs': '維珍大西洋航空', 'virgin atlantic': '維珍大西洋航空', '維珍': '維珍大西洋航空',
  'su': '俄羅斯航空', 'aeroflot': '俄羅斯航空', '俄航': '俄羅斯航空',
  'tk': '土耳其航空', 'turkish airlines': '土耳其航空', '土航': '土耳其航空',
  'ek': '阿聯酋航空', 'emirates': '阿聯酋航空',
  'ey': '阿提哈德航空', 'etihad': '阿提哈德航空', 'etihad airways': '阿提哈德航空',
  'qr': '卡塔爾航空', 'qatar airways': '卡塔爾航空', '卡航': '卡塔爾航空',
  'sv': '沙特阿拉伯航空', 'saudia': '沙特阿拉伯航空',
  'et': '埃塞俄比亞航空', 'ethiopian airlines': '埃塞俄比亞航空',
  'ms': '埃及航空', 'egyptair': '埃及航空',
  'sa': '南非航空', 'south african airways': '南非航空',
  'aa': '美國航空', 'american airlines': '美國航空', '美航': '美國航空',
  'ua': '聯合航空', 'united airlines': '聯合航空', '美聯航': '聯合航空',
  'dl': '達美航空', 'delta': '達美航空', 'delta air lines': '達美航空',
  'ac': '加拿大航空', 'air canada': '加拿大航空', '加航': '加拿大航空',
  'am': '墨西哥國際航空', 'aeromexico': '墨西哥國際航空',
  'la': '南美航空', 'latam': '南美航空', 'latam airlines': '南美航空',
  'fx': '聯邦快遞', 'fedex': '聯邦快遞', 'fedex express': '聯邦快遞',
  '5x': 'UPS航空', 'ups': 'UPS航空', 'ups airlines': 'UPS航空',
  'po': 'Polar Air Cargo', 'polar': 'Polar Air Cargo',
  'k4': 'Kalitta Air', 'kalitta': 'Kalitta Air',
  'n8': 'National Airlines', 'national': 'National Airlines',
  'ru': 'AirBridgeCargo', 'airbridge': 'AirBridgeCargo',
  'cv': 'Cargolux', 'cargolux': 'Cargolux'
};

// ============================================
// 機型資料庫
// ============================================
const aircraftTypeDB = {
  'b77w': 'Boeing 777-300ER', 'b773': 'Boeing 777-300', 'b772': 'Boeing 777-200',
  'b77l': 'Boeing 777-200LR', 'b77f': 'Boeing 777F', '77w': 'Boeing 777-300ER',
  '773': 'Boeing 777-300', '772': 'Boeing 777-200',
  'b78x': 'Boeing 787-10', 'b789': 'Boeing 787-9', 'b788': 'Boeing 787-8',
  '788': 'Boeing 787-8', '789': 'Boeing 787-9', '78x': 'Boeing 787-10',
  'b748': 'Boeing 747-8', 'b744': 'Boeing 747-400', 'b74f': 'Boeing 747-400F',
  'b74s': 'Boeing 747-8F', '748': 'Boeing 747-8', '744': 'Boeing 747-400',
  'b739': 'Boeing 737-900', 'b738': 'Boeing 737-800', 'b737': 'Boeing 737-700',
  '738': 'Boeing 737-800', '739': 'Boeing 737-900',
  'b38m': 'Boeing 737 MAX 8', 'b39m': 'Boeing 737 MAX 9', 'b3xm': 'Boeing 737 MAX 10',
  '38m': 'Boeing 737 MAX 8', '39m': 'Boeing 737 MAX 9',
  'b763': 'Boeing 767-300', 'b764': 'Boeing 767-400', 'b762': 'Boeing 767-200',
  '763': 'Boeing 767-300',
  'b752': 'Boeing 757-200', 'b753': 'Boeing 757-300',
  'a359': 'Airbus A350-900', 'a35k': 'Airbus A350-1000', '359': 'Airbus A350-900', '35k': 'Airbus A350-1000',
  'a333': 'Airbus A330-300', 'a332': 'Airbus A330-200', 'a339': 'Airbus A330-900neo',
  '333': 'Airbus A330-300', '332': 'Airbus A330-200', '339': 'Airbus A330-900neo',
  'a388': 'Airbus A380-800', '388': 'Airbus A380-800', 'a380': 'Airbus A380-800',
  'a321': 'Airbus A321-200', 'a320': 'Airbus A320-200', 'a319': 'Airbus A319-100', 'a318': 'Airbus A318-100',
  'a21n': 'Airbus A321neo', 'a20n': 'Airbus A320neo', 'a19n': 'Airbus A319neo',
  '21n': 'Airbus A321neo', '20n': 'Airbus A320neo',
  'a343': 'Airbus A340-300', 'a346': 'Airbus A340-600', 'a342': 'Airbus A340-200',
  'a310': 'Airbus A310-300', 'a306': 'Airbus A300-600',
  'e190': 'Embraer E190', 'e195': 'Embraer E195', 'e290': 'Embraer E190-E2', 'e295': 'Embraer E195-E2',
  'e170': 'Embraer E170', 'e175': 'Embraer E175',
  'c919': 'COMAC C919', 'arj21': 'COMAC ARJ21',
  'at72': 'ATR 72-600', 'at76': 'ATR 72-600', 'at75': 'ATR 72-500',
  'crj9': 'Bombardier CRJ-900', 'crj7': 'Bombardier CRJ-700',
  'md11': 'McDonnell Douglas MD-11', 'md83': 'McDonnell Douglas MD-83', 'md88': 'McDonnell Douglas MD-88',
  'b727': 'Boeing 727-200', 'dc10': 'McDonnell Douglas DC-10'
};

// ============================================
// 機場資料庫
// ============================================
const airportDB = {
  'HKG': '香港國際機場', 'VHHH': '香港國際機場',
  'TPE': '台北桃園國際機場', 'RCTP': '台北桃園國際機場',
  'TSA': '台北松山機場', 'RCSS': '台北松山機場',
  'KHH': '高雄國際機場', 'RCKH': '高雄國際機場',
  'PEK': '北京首都國際機場', 'ZBAA': '北京首都國際機場',
  'PKX': '北京大興國際機場', 'ZBAD': '北京大興國際機場',
  'PVG': '上海浦東國際機場', 'ZSPD': '上海浦東國際機場',
  'SHA': '上海虹橋國際機場', 'ZSSS': '上海虹橋國際機場',
  'CAN': '廣州白雲國際機場', 'ZGGG': '廣州白雲國際機場',
  'SZX': '深圳寶安國際機場', 'ZGSZ': '深圳寶安國際機場',
  'CTU': '成都雙流國際機場', 'ZUUU': '成都雙流國際機場',
  'TFU': '成都天府國際機場', 'ZUTF': '成都天府國際機場',
  'HGH': '杭州蕭山國際機場', 'ZSHC': '杭州蕭山國際機場',
  'XMN': '廈門高崎國際機場', 'ZSAM': '廈門高崎國際機場',
  'NRT': '東京成田國際機場', 'RJAA': '東京成田國際機場',
  'HND': '東京羽田機場', 'RJTT': '東京羽田機場',
  'KIX': '大阪關西國際機場', 'RJBB': '大阪關西國際機場',
  'ICN': '首爾仁川國際機場', 'RKSI': '首爾仁川國際機場',
  'GMP': '首爾金浦國際機場', 'RKSS': '首爾金浦國際機場',
  'SIN': '新加坡樟宜機場', 'WSSS': '新加坡樟宜機場',
  'BKK': '曼谷素萬那普機場', 'VTBS': '曼谷素萬那普機場',
  'DMK': '曼谷廊曼國際機場', 'VTBD': '曼谷廊曼國際機場',
  'KUL': '吉隆坡國際機場', 'WMKK': '吉隆坡國際機場',
  'MNL': '馬尼拉國際機場', 'RPLL': '馬尼拉國際機場',
  'SGN': '胡志明市新山一機場', 'VVTS': '胡志明市新山一機場',
  'HAN': '河內內排國際機場', 'VVNB': '河內內排國際機場',
  'CGK': '雅加達蘇加諾哈達機場', 'WIII': '雅加達蘇加諾哈達機場',
  'DEL': '新德里英迪拉甘地機場', 'VIDP': '新德里英迪拉甘地機場',
  'BOM': '孟買國際機場', 'VABB': '孟買國際機場',
  'SYD': '悉尼國際機場', 'YSSY': '悉尼國際機場',
  'MEL': '墨爾本國際機場', 'YMML': '墨爾本國際機場',
  'BNE': '布里斯本機場', 'YBBN': '布里斯本機場',
  'AKL': '奧克蘭國際機場', 'NZAA': '奧克蘭國際機場',
  'LHR': '倫敦希斯路機場', 'EGLL': '倫敦希斯路機場',
  'LGW': '倫敦格域機場', 'EGKK': '倫敦格域機場',
  'CDG': '巴黎戴高樂機場', 'LFPG': '巴黎戴高樂機場',
  'FRA': '法蘭克福機場', 'EDDF': '法蘭克福機場',
  'AMS': '阿姆斯特丹史基浦機場', 'EHAM': '阿姆斯特丹史基浦機場',
  'ZRH': '蘇黎世機場', 'LSZH': '蘇黎世機場',
  'MAD': '馬德里巴拉哈斯機場', 'LEMD': '馬德里巴拉哈斯機場',
  'FCO': '羅馬菲烏米奇諾機場', 'LIRF': '羅馬菲烏米奇諾機場',
  'MXP': '米蘭馬爾彭薩機場', 'LIMC': '米蘭馬爾彭薩機場',
  'VIE': '維也納國際機場', 'LOWW': '維也納國際機場',
  'CPH': '哥本哈根機場', 'EKCH': '哥本哈根機場',
  'HEL': '赫爾辛基萬塔機場', 'EFHK': '赫爾辛基萬塔機場',
  'ARN': '斯德哥爾摩阿蘭達機場', 'ESSA': '斯德哥爾摩阿蘭達機場',
  'OSL': '奧斯陸機場', 'ENGM': '奧斯陸機場',
  'DUB': '都柏林機場', 'EIDW': '都柏林機場',
  'IST': '伊斯坦堡機場', 'LTFM': '伊斯坦堡機場',
  'DXB': '杜拜國際機場', 'OMDB': '杜拜國際機場',
  'AUH': '阿布扎比國際機場', 'OMAA': '阿布扎比國際機場',
  'DOH': '多哈哈馬德國際機場', 'OTHH': '多哈哈馬德國際機場',
  'JFK': '紐約甘迺迪國際機場', 'KJFK': '紐約甘迺迪國際機場',
  'EWR': '紐瓦克自由國際機場', 'KEWR': '紐瓦克自由國際機場',
  'LAX': '洛杉磯國際機場', 'KLAX': '洛杉磯國際機場',
  'SFO': '三藩市國際機場', 'KSFO': '三藩市國際機場',
  'ORD': '芝加哥奧黑爾國際機場', 'KORD': '芝加哥奧黑爾國際機場',
  'DFW': '達拉斯沃斯堡機場', 'KDFW': '達拉斯沃斯堡機場',
  'ATL': '亞特蘭大國際機場', 'KATL': '亞特蘭大國際機場',
  'MIA': '邁阿密國際機場', 'KMIA': '邁阿密國際機場',
  'SEA': '西雅圖塔科馬機場', 'KSEA': '西雅圖塔科馬機場',
  'BOS': '波士頓洛根機場', 'KBOS': '波士頓洛根機場',
  'IAD': '華盛頓杜勒斯機場', 'KIAD': '華盛頓杜勒斯機場',
  'YVR': '溫哥華國際機場', 'CYVR': '溫哥華國際機場',
  'YYZ': '多倫多皮爾遜機場', 'CYYZ': '多倫多皮爾遜機場',
  'YUL': '蒙特利爾杜魯多機場', 'CYUL': '蒙特利爾杜魯多機場',
  'MEX': '墨西哥城國際機場', 'MMMX': '墨西哥城國際機場',
  'GRU': '聖保羅瓜魯柳斯機場', 'SBGR': '聖保羅瓜魯柳斯機場',
  'EZE': '布宜諾斯艾利斯機場', 'SAEZ': '布宜諾斯艾利斯機場',
  'JNB': '約翰內斯堡國際機場', 'FAOR': '約翰內斯堡國際機場',
  'CAI': '開羅國際機場', 'HECA': '開羅國際機場'
};

function findInDB(db, query) {
  if (!query) return null;
  const q = query.toString().trim().toLowerCase();
  if (db[q]) return db[q];
  for (const key in db) {
    if (key.toLowerCase() === q) return db[key];
  }
  return null;
}

// ============================================
// Passport Google OAuth
// ============================================
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
clientSecret: process.env.GOOGLE_CLIENT_SECRET,
callbackURL: process.env.GOOGLE_CALLBACK_URL || '/auth/google/callback'
}, (accessToken, refreshToken, profile, done) => {
  const user = {
    id: profile.id,
    name: profile.displayName,
    email: profile.emails && profile.emails[0] ? profile.emails[0].value : '',
    avatar: profile.photos && profile.photos[0] ? profile.photos[0].value : '',
    role: 'user',
    isSuper: false
  };

  const isSuperAdmin =
    user.email.toLowerCase() === SUPER_ADMIN.email.toLowerCase() &&
    user.name.toLowerCase() === SUPER_ADMIN.name.toLowerCase();

  const inAdminList = ADMIN_LIST.find(a =>
    a.email.toLowerCase() === user.email.toLowerCase() &&
    a.name.toLowerCase() === user.name.toLowerCase()
  );

  if (isSuperAdmin) {
    user.role = 'admin';
    user.isSuper = true;
    console.log('[SUPER ADMIN] ' + user.name + ' (' + user.email + ') 總管理員已登入');
  } else if (inAdminList) {
    user.role = 'admin';
    console.log('[ADMIN] ' + user.name + ' (' + user.email + ') 管理員已登入');
  }

  const existing = knownUsers.get(user.id);
  const notify = existing ? existing.notify : { login: true, review: true };
  knownUsers.set(user.id, {
    id: user.id,
    name: user.name,
    email: user.email,
    avatar: user.avatar,
    role: user.role,
    isSuper: user.isSuper,
    score: existing ? existing.score : (user.role === 'admin' ? null : START_SCORE),
    notify: notify,
    banned: existing ? (existing.banned || null) : null,
    favorites: existing ? (existing.favorites || []) : [],
    following: existing ? (existing.following || []) : [],
    created_at: existing ? (existing.created_at || null) : new Date().toISOString()
  });
  // 🔐 功能15：登入紀錄
  loginRecords.push({ user_id: user.id, name: user.name, email: user.email, role: user.role, isSuper: user.isSuper, at: new Date().toISOString() });
  if (loginRecords.length > 1000) loginRecords = loginRecords.slice(-1000);
  saveDB();

  if (notify.login && user.email) {
    sendEmail(
      user.email,
      '✅ 登入成功 — cxhkgcxvhhh Aviation enthusiast Club',
      buildEmailHtml({
        color: '#2e7d32',
        icon: '✅',
        title: '登入成功！',
        bodyHtml:
          '<p style="margin:0 0 18px;">你好 <b>' + user.name + '</b> 👋</p>' +
          '<p style="margin:0 0 18px;">你啱啱成功登入咗 <b>cxhkgcxvhhh Aviation enthusiast Club</b>！</p>' +
          '<div style="background:#f4f8fc;border-radius:12px;padding:6px 18px;margin-bottom:18px;">' +
            infoRow('👤 帳戶', user.name) +
            infoRow('🕐 登入時間', new Date().toLocaleString('zh-HK')) +
            infoRow('⭐ 你嘅身份', user.role === 'admin' ? (user.isSuper ? '👑 總管理員' : '👑 管理員') : '會員') +
          '</div>' +
          '<div style="background:#fff5f5;border:1px solid #f5c6c6;border-radius:12px;padding:14px 18px;font-size:13px;color:#8a3a3a;">' +
            '⚠️ 如果呢次登入<strong>唔係你本人</strong>操作，請立即聯絡我哋：' + SITE_EMAIL +
          '</div>',
        footnote: '想停止接收登入通知？登入後去「個人檔案」→「電郵通知設定」就可以隨時取消。'
      })
    );
  }

  return done(null, user);
}));

// ============================================
// 驗證中間件
// ============================================
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    activeUsers.set(req.user.id, Date.now());
    if (isAdminRole(req.user)) onlineAdmins.set(req.user.id, Date.now());
    return next();
  }
  res.redirect('/login');
}

function ensureAdmin(req, res, next) {
  if (req.isAuthenticated() && isAdminRole(req.user)) {
    onlineAdmins.set(req.user.id, Date.now());
    return next();
  }
  res.status(403).send('<h1 style="font-family:sans-serif;text-align:center;margin-top:80px;">403 — 只有管理員可以先入到嚟 🚫</h1>');
}

function ensureSuperAdmin(req, res, next) {
  if (req.isAuthenticated() && req.user.isSuper) {
    return next();
  }
  res.status(403).json({ error: '只有總管理員先可以做呢個操作 🚫' });
}

// ============================================
// 🚫 封鎖用戶功能
// ============================================
function getBan(user) {
  const me = user ? knownUsers.get(user.id) : null;
  return me && me.banned ? me.banned : null;
}

function bannedPageHtml(ban) {
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>帳號已被封鎖</title></head>' +
    '<body style="margin:0;font-family:\'Microsoft JhengHei\',sans-serif;background:linear-gradient(160deg,#cfe4f7,#ffffff);min-height:100vh;display:flex;align-items:center;justify-content:center;">' +
    '<div style="max-width:520px;background:rgba(255,255,255,0.9);border-radius:20px;padding:40px;text-align:center;box-shadow:0 12px 40px rgba(30,60,100,0.15);">' +
      '<div style="font-size:52px;">🚫</div>' +
      '<h1 style="font-size:22px;color:#c62828;margin:10px 0 18px;">你嘅帳號已被封鎖</h1>' +
      '<div style="background:#fff5f5;border:1px solid #f5c6c6;border-radius:12px;padding:16px 20px;text-align:left;font-size:14px;color:#34495e;line-height:1.9;">' +
        '<b style="color:#c62828;">封鎖原因</b><br>' + (ban.reason || '無註明') +
        '<div style="margin-top:10px;font-size:12px;color:#8ba0b3;">由 ' + (ban.by || '管理員') + ' 於 ' + new Date(ban.at).toLocaleString('zh-HK') + ' 執行</div>' +
      '</div>' +
      '<p style="font-size:13px;color:#5f7285;margin:18px 0;">喺封鎖期間你唔可以上載相片。如果你認為有誤會，請電郵 <a href="mailto:cxcvaec@gmail.com" style="color:#1976d2;">cxcvaec@gmail.com</a> 申訴。</p>' +
      '<a href="/" style="color:#1976d2;font-size:14px;">返回首頁</a>' +
    '</div></body></html>';
}

// ============================================
// 水印功能（sharp）— 窄黑條 + 細字 + 左右兩角
// ============================================
function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function addWatermark(imagePath, photographerName) {
  try {
    const image = sharp(imagePath);
    const meta = await image.metadata();
    const width = meta.width;
    const height = meta.height;
    const barHeight = Math.max(24, Math.round(height * 0.032));
    const fontSize = Math.max(10, Math.round(barHeight * 0.48));
    const year = new Date().getFullYear();
    const leftText = escapeXml('© ' + photographerName + ' ' + year);
    const rightText = escapeXml('cxhkgcxvhhh Aviation enthusiast Club');
    const padding = Math.max(8, Math.round(barHeight * 0.3));

   const fontPath = path.join(__dirname, 'fonts', 'ARIAL.TTF');
let fontFace = '';
if (fs.existsSync(fontPath)) {
    const fontBase64 = fs.readFileSync(fontPath).toString('base64');
    fontFace = '@font-face { font-family: "EmbedFont"; src: url("data:font/truetype;base64,' + fontBase64 + '"); }';
}

const svg = '<svg width="' + width + '" height="' + barHeight + '" xmlns="http://www.w3.org/2000/svg">' +
    '<defs><style>' + fontFace + '</style></defs>' +
    '<rect x="0" y="0" width="' + width + '" height="' + barHeight + '" fill="#000000" fill-opacity="0.7"/>' +
    '<text x="' + padding + '" y="' + Math.round(barHeight / 2) + '" dy="0.35em" ' +
    'font-family="EmbedFont, Arial, sans-serif" font-size="' + fontSize + '" fill="#ffffff">' + leftText + '</text>' +
    '<text x="' + (width - padding) + '" y="' + Math.round(barHeight / 2) + '" dy="0.35em" ' +
    'text-anchor="end" font-family="EmbedFont, Arial, sans-serif" font-size="' + fontSize + '" fill="#ffffff">' + rightText + '</text>' +
    '</svg>';

    const tmpPath = imagePath + '.tmp';
    await image
      .extend({ bottom: barHeight, background: { r: 0, g: 0, b: 0 } })
      .composite([{ input: Buffer.from(svg), top: height, left: 0 }])
      .toFile(tmpPath);
    fs.renameSync(tmpPath, imagePath);
    console.log('[WATERMARK] 已加浮水印：' + path.basename(imagePath));
  } catch (err) {
    console.error('[WATERMARK] 加浮水印失敗：', err.message);
  }
}

// ============================================
// 🤖 EXIF 自動識別（要喺加水印之前讀）
// ============================================
async function readExif(imagePath) {
  try {
    const e = await exifr.parse(imagePath, {
      pick: ['Make', 'Model', 'LensModel', 'LensMake', 'FNumber', 'ExposureTime', 'ISO', 'FocalLength']
    });
    if (!e || (!e.Model && !e.ISO && !e.FNumber && !e.ExposureTime)) return null;

    let shutter = '';
    if (e.ExposureTime) {
      shutter = e.ExposureTime >= 1
        ? e.ExposureTime + 's'
        : '1/' + Math.round(1 / e.ExposureTime) + 's';
    }

    return {
      camera: ((e.Make || '') + ' ' + (e.Model || '')).trim(),
      lens: ((e.LensMake || '') + ' ' + (e.LensModel || '')).trim(),
      aperture: e.FNumber ? 'f/' + e.FNumber : '',
      shutter: shutter,
      iso: e.ISO ? 'ISO ' + e.ISO : '',
      focal: e.FocalLength ? Math.round(e.FocalLength) + 'mm' : ''
    };
  } catch (err) {
    return null;
  }
}

// ============================================
// 🎨 色彩分析（主色 + 五色色板 + 色域圖 + 明暗冷暖）
// ============================================
function rgbToHex(r, g, b) {
  const h = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return '#' + h(r) + h(g) + h(b);
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

async function analyzeColors(imagePath) {
  try {
    const stats = await sharp(imagePath).stats();
    const dom = stats.dominant || { r: 128, g: 128, b: 128 };
    const ch = stats.channels || [];
    const rMean = ch[0] ? ch[0].mean : 128;
    const gMean = ch[1] ? ch[1].mean : 128;
    const bMean = ch[2] ? ch[2].mean : 128;
    const brightness = Math.round((rMean + gMean + bMean) / 3);

    // 五色色板：將張相縮做 5x1 拎五隻代表色
    const rawPalette = await sharp(imagePath)
      .resize(5, 1, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer();
    const palette = [];
    for (let i = 0; i < 5; i++) {
      palette.push(rgbToHex(rawPalette[i * 3], rawPalette[i * 3 + 1], rawPalette[i * 3 + 2]));
    }

    // 色域圖數據：縮做 24x24，每點計 HSL（跳過近灰色嘅像素）
    const GAMUT_SIZE = 24;
    const rawGamut = await sharp(imagePath)
      .resize(GAMUT_SIZE, GAMUT_SIZE, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer();
    const gamut = [];
    for (let i = 0; i < GAMUT_SIZE * GAMUT_SIZE; i++) {
      const r = rawGamut[i * 3], g = rawGamut[i * 3 + 1], b = rawGamut[i * 3 + 2];
      const hsl = rgbToHsl(r, g, b);
      if (hsl.s >= 8) {
        gamut.push([hsl.h, hsl.s, hsl.l]);
      }
    }

    let brightnessDesc = '亮度適中';
    if (brightness < 70) brightnessDesc = '整體偏暗';
    else if (brightness > 185) brightnessDesc = '整體偏光';

    let toneDesc = '色溫中性';
    if (bMean - rMean > 12) toneDesc = '偏藍調（冷色）';
    else if (rMean - bMean > 12) toneDesc = '偏暖調';

    return {
      dominant: rgbToHex(dom.r, dom.g, dom.b),
      palette: palette,
      gamut: gamut,
      brightness: brightness,
      brightnessDesc: brightnessDesc,
      toneDesc: toneDesc
    };
  } catch (err) {
    console.error('[COLOR] 色彩分析失敗：', err.message);
    return null;
  }
}

// ============================================
// 🏷️ 塗裝類型（共 11 款：8 款飛機 + 機場／客運大樓／地勤）
// ============================================
const CATEGORIES = ['standard', 'special', 'cargo', 'cargo-special', 'military', 'private', 'heli', 'retro', 'airport', 'terminal', 'ground'];

// 🏷️ 塗裝類型自動判斷（用戶冇揀嗰陣先用）
function detectCategory(aircraftType, airline, livery) {
  const t = (aircraftType || '').toUpperCase();
  const a = (airline || '').toLowerCase();
  const l = (livery || '').toLowerCase();
  const isCargo = /F$|FREIGHTER|BCF|BDSF/.test(t) ||
    ['fedex', 'ups', 'cargolux', 'polar air', 'kalitta', 'airbridgecargo', 'national airlines', '聯邦快遞', '貨運', 'cargo'].some(c => a.includes(c));
  const isSpecial = l.includes('彩繪') || l.includes('特別') || l.includes('special') || l.includes('oneworld') || l.includes('寰宇') || l.includes('星空聯盟') || l.includes('star alliance') || l.includes('天合');
  if (l.includes('直升機') || l.includes('heli') || t.includes('HELICOPTER') || /^H\d/.test(t)) return 'heli';
  if (a.includes('空軍') || a.includes('air force') || a.includes('military') || a.includes('navy') || a.includes('海軍') || a.includes('軍')) return 'military';
  if (isCargo && isSpecial) return 'cargo-special';
  if (isCargo) return 'cargo';
  if (isSpecial) return 'special';
  if (l.includes('復古') || l.includes('retro')) return 'retro';
  if (l.includes('私人') || l.includes('公務') || l.includes('private') || l.includes('bizjet')) return 'private';
  return 'standard';
}

// 分數調整（管理員另計）📜 功能20：每次加減都會記低
function adjustScore(userId, delta, reason, by) {
  const u = knownUsers.get(userId);
  if (!u) return;
  if (u.role === 'admin') return;
  u.score = (u.score == null ? START_SCORE : u.score) + delta;
  scoreHistory.push({
    user_id: u.id,
    user_name: u.name,
    delta: delta,
    score_after: u.score,
    reason: reason || '系統調整',
    by: by || '系統',
    at: new Date().toISOString()
  });
  if (scoreHistory.length > 2000) scoreHistory = scoreHistory.slice(-2000);
  console.log('[SCORE] ' + u.name + ' 分數 ' + (delta > 0 ? '+' : '') + delta + ' → ' + u.score + '（' + (reason || '') + '）');
}

// 可以修改嘅相片欄位
const EDITABLE_FIELDS = ['title', 'registration', 'airline', 'flight_number', 'aircraft_type', 'livery', 'origin', 'destination', 'photo_date', 'location', 'camera_settings', 'extra_info', 'category'];

// 📧 彩色審核結果通知
function sendReviewEmail(photo, status) {
  const u = knownUsers.get(photo.user_id);
  if (!u || !u.email || !u.notify || !u.notify.review) return;
  if (status === 'approved') {
    sendEmail(
      u.email,
      '✅ 你嘅相片已通過審核！— cxhkgcxvhhh Aviation enthusiast Club',
      buildEmailHtml({
        color: '#2e7d32',
        icon: '🎉',
        title: '相片已通過審核！',
        bodyHtml:
          '<p style="margin:0 0 18px;">你好 <b>' + u.name + '</b>！</p>' +
          '<p style="margin:0 0 18px;">好消息！你上傳嘅相片已通過審核，而家已經喺網站公開展出 ✈️</p>' +
          '<div style="background:#f4f8fc;border-radius:12px;padding:6px 18px;margin-bottom:18px;">' +
            infoRow('📷 相片', photo.title) +
            infoRow('👑 審核員', photo.reviewed_by || '—') +
            infoRow('🕐 審核時間', new Date(photo.reviewed_at).toLocaleString('zh-HK')) +
            infoRow('⭐ 分數變化', '<span style="color:#2e7d32;">+1 分</span>') +
          '</div>' +
          '<p style="margin:0;font-size:13px;color:#5f7285;">繼續上傳更多精彩作品，累積更高分數啦！📸</p>',
        footnote: '想停止接收審核通知？登入後去「個人檔案」→「電郵通知設定」就可以取消。'
      })
    );
  } else {
    sendEmail(
      u.email,
      '❌ 你嘅相片未通過審核 — cxhkgcxvhhh Aviation enthusiast Club',
      buildEmailHtml({
        color: '#c62828',
        icon: '📋',
        title: '相片未通過審核',
        bodyHtml:
          '<p style="margin:0 0 18px;">你好 <b>' + u.name + '</b>，</p>' +
          '<p style="margin:0 0 18px;">抱歉，你上傳嘅相片今次未能通過審核：</p>' +
          '<div style="background:#f4f8fc;border-radius:12px;padding:6px 18px;margin-bottom:18px;">' +
            infoRow('📷 相片', photo.title) +
            infoRow('👑 審核員', photo.reviewed_by || '—') +
            infoRow('⭐ 分數變化', '<span style="color:#c62828;">−1 分</span>') +
          '</div>' +
          '<div style="background:#fff5f5;border:1px solid #f5c6c6;border-radius:12px;padding:14px 18px;margin-bottom:18px;">' +
            '<b style="color:#c62828;font-size:13px;">拒絕原因</b>' +
            '<div style="color:#34495e;font-size:14px;margin-top:6px;">' + (photo.reject_reason || '無註明') + '</div>' +
          '</div>' +
          '<p style="margin:0;font-size:13px;color:#5f7285;">如果你認為審核結果有誤，可以登入你嘅個人檔案，喺被拒絕嘅相片上撳「上訴」，或者電郵至 <a href="mailto:' + APPEAL_EMAIL + '" style="color:#1976d2;">' + APPEAL_EMAIL + '</a> 提出上訴。</p>',
        footnote: '想停止接收審核通知？登入後去「個人檔案」→「電郵通知設定」就可以取消。'
      })
    );
  }
}

// 📧 要求補充資料通知（藍色）
function sendChangesEmail(photo) {
  const u = knownUsers.get(photo.user_id);
  if (!u || !u.email || !u.notify || !u.notify.review) return;
  sendEmail(
    u.email,
    '✏️ 你嘅相片需要補充資料 — cxhkgcxvhhh Aviation enthusiast Club',
    buildEmailHtml({
      color: '#1976d2',
      icon: '✏️',
      title: '相片需要補充資料',
      bodyHtml:
        '<p style="margin:0 0 18px;">你好 <b>' + u.name + '</b>，</p>' +
        '<p style="margin:0 0 18px;">你嘅相片整體冇問題，但審核員發現有啲資料需要補充或者修正。<b>呢個唔係拒絕，你嘅分數唔會被扣！</b></p>' +
        '<div style="background:#f4f8fc;border-radius:12px;padding:6px 18px;margin-bottom:18px;">' +
          infoRow('📷 相片', photo.title) +
          infoRow('👑 審核員', photo.reviewed_by || '—') +
        '</div>' +
        '<div style="background:#eaf3fc;border:1px solid #b3d4f0;border-radius:12px;padding:14px 18px;margin-bottom:18px;">' +
          '<b style="color:#1976d2;font-size:13px;">需要補充／修正嘅資料</b>' +
          '<div style="color:#34495e;font-size:14px;margin-top:6px;">' + (photo.admin_note || '—') + '</div>' +
        '</div>' +
        '<p style="margin:0;font-size:13px;color:#5f7285;">請登入你嘅「個人檔案」，喺「需要補充資料」嗰個部分直接修改，改完撳「重新提交」，相片就會自動返去審核隊列，審核員會盡快幫你通過 ✈️</p>',
      footnote: '想停止接收審核通知？登入後去「個人檔案」→「電郵通知設定」就可以取消。'
    })
  );
}

// ============================================
// 📢 功能11：公告板 middleware（每頁都有公告列表；啱啱登入嗰下彈一次）
// ============================================
app.use((req, res, next) => {
  res.locals.announcements = announcements.slice().sort((a, b) => b.id - a.id);
  if (req.session && req.session.showAnn) {
    res.locals.showAnnPopup = res.locals.announcements.length > 0;
    req.session.showAnn = false;
  } else {
    res.locals.showAnnPopup = false;
  }
  next();
});

// ============================================
// 頁面路由
// ============================================

app.get('/', (req, res) => {
  const featured = photos.filter(p => p.status === 'approved' && p.is_featured);
  const latest = photos.filter(p => p.status === 'approved')
    .sort((a, b) => b.id - a.id).slice(0, 12);
  const approvedNews = news.filter(n => n.status === 'approved')
    .sort((a, b) => b.id - a.id).slice(0, 10);

  const contributorMap = {};
  photos.filter(p => p.status === 'approved').forEach(p => {
    if (!contributorMap[p.user_id]) contributorMap[p.user_id] = { name: p.user_name, count: 0 };
    contributorMap[p.user_id].count++;
  });
  const topContributors = Object.values(contributorMap)
    .sort((a, b) => b.count - a.count).slice(0, 5);

  const today = new Date().toDateString();
  const todayMap = {};
  photos.filter(p => new Date(p.created_at).toDateString() === today && p.status === 'approved').forEach(p => {
    if (!todayMap[p.user_id]) todayMap[p.user_id] = { name: p.user_name, approved: 0 };
    todayMap[p.user_id].approved++;
  });
  const topToday = Object.values(todayMap)
    .sort((a, b) => b.approved - a.approved).slice(0, 5)
    .map(u => ({ name: u.name, count: u.approved }));

  res.render('index', { user: req.user, featured, latest, newsList: approvedNews, topContributors, topToday });
});

app.get('/gallery', (req, res) => {
  const allApproved = photos.filter(p => p.status === 'approved');
  const types = [...new Set(allApproved.map(p => p.aircraft_type).filter(Boolean))].sort();
  const liveries = [...new Set(allApproved.map(p => p.livery).filter(Boolean))].sort();
  res.render('gallery', { user: req.user, types, liveries });
});

// 📸 攝影師頁：只限已登入用戶
app.get('/photographers', ensureAuthenticated, (req, res) => {
  const list = [...knownUsers.values()].map(u => ({
    id: u.id,
    name: u.name,
    avatar: u.avatar,
    role: u.role,
    isSuper: !!u.isSuper,
    score: u.score,
    photoCount: photos.filter(p => p.user_id === u.id && p.status === 'approved').length
  }));
  list.sort((a, b) => b.photoCount - a.photoCount);
  res.render('photographers', { user: req.user, photographers: list });
});

// 📰 新聞專頁
app.get('/news', (req, res) => {
  const approvedNews = news.filter(n => n.status === 'approved')
    .sort((a, b) => b.id - a.id);
  res.render('news', { user: req.user, newsList: approvedNews });
});

app.get('/contact', (req, res) => {
  res.render('contact', { user: req.user, sent: req.query.sent === '1' });
});

app.post('/contact', (req, res) => {
  const name = (req.body.contact_name || '').trim();
  const email = (req.body.contact_email || '').trim();
  const message = (req.body.contact_message || '').trim();
  if (!name || !email || !message) {
    return res.redirect('/contact');
  }
  sendEmail(
    SITE_EMAIL,
    '📮 網站聯絡表格：' + name,
    buildEmailHtml({
      color: '#1976d2',
      icon: '📮',
      title: '收到新訊息！',
      bodyHtml:
        '<p style="margin:0 0 18px;">有人透過網站聯絡表格留言：</p>' +
        '<div style="background:#f4f8fc;border-radius:12px;padding:6px 18px;margin-bottom:18px;">' +
          infoRow('👤 姓名', name) +
          infoRow('📧 電郵', email) +
          infoRow('🕐 時間', new Date().toLocaleString('zh-HK')) +
        '</div>' +
        '<div style="background:#ffffff;border:2px solid #e3eaf2;border-radius:12px;padding:16px 18px;">' +
          '<b style="color:#1976d2;font-size:13px;">💬 訊息內容</b>' +
          '<div style="color:#34495e;font-size:14px;margin-top:8px;white-space:pre-wrap;">' + message + '</div>' +
        '</div>',
      footnote: '直接回覆呢個人嘅電郵：' + email
    })
  );
  res.redirect('/contact?sent=1');
});

app.get('/privacy', (req, res) => {
  res.render('privacy', { user: req.user });
});

app.get('/login', (req, res) => {
  res.render('login', { user: req.user });
});

app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => { req.session.showAnn = true; res.redirect('/'); }
);

app.get('/logout', (req, res) => {
  req.logout(() => res.redirect('/'));
});

// 🕐 攞用戶創建帳號時間：冇記錄嘅舊會員就用佢第一次登入紀錄嘅時間
function getCreatedAt(u) {
  if (!u) return null;
  if (u.created_at) return u.created_at;
  const rec = loginRecords.find(r => r.user_id === u.id);
  return rec ? rec.at : null;
}

app.get('/profile', ensureAuthenticated, (req, res) => {
  const myPhotos = photos.filter(p => p.user_id === req.user.id);
  const me = knownUsers.get(req.user.id);
  const myFavIds = me && me.favorites ? me.favorites : [];
  const favPhotos = photos.filter(p => myFavIds.includes(p.id));
  const myFollowingIds = me && me.following ? me.following : [];
  const followingUsers = myFollowingIds.map(fid => {
    const fu = knownUsers.get(fid);
    return fu ? { id: fu.id, name: fu.name, avatar: fu.avatar, role: fu.role, isSuper: !!fu.isSuper } : null;
  }).filter(Boolean);
  res.render('profile', {
    user: req.user,
    createdAt: getCreatedAt(me),
    favPhotos: favPhotos,
    followingUsers: followingUsers,
    myScore: me ? me.score : null,
    notify: me && me.notify ? me.notify : { login: true, review: true },
    changesPhotos: myPhotos.filter(p => p.status === 'changes_requested'),
    approved: myPhotos.filter(p => p.status === 'approved'),
    pending: myPhotos.filter(p => p.status === 'pending'),
    rejected: myPhotos.filter(p => p.status === 'rejected')
  });
});

app.get('/user/:id', (req, res) => {
  const targetPhotos = photos.filter(p => p.user_id === req.params.id);
  const known = knownUsers.get(req.params.id);
  if (targetPhotos.length === 0 && !known && req.params.id !== (req.user && req.user.id)) {
    return res.status(404).send('<h1 style="font-family:sans-serif;text-align:center;margin-top:80px;">搵唔到呢個用戶 😢</h1>');
  }
  const targetName = known ? known.name : (targetPhotos.length > 0 ? targetPhotos[0].user_name : (req.user ? req.user.name : '用戶'));
  const targetAvatar = known ? known.avatar : '';
  const followerCount = [...knownUsers.values()].filter(u => u.following && u.following.includes(req.params.id)).length;
  const meUser = req.user ? knownUsers.get(req.user.id) : null;
  const isFollowing = meUser && meUser.following ? meUser.following.includes(req.params.id) : false;
  res.render('public-profile', {
    user: req.user,
    targetCreatedAt: getCreatedAt(known),
    isFollowing: isFollowing,
    followerCount: followerCount,
    targetUser: {
      id: req.params.id,
      name: targetName,
      avatar: targetAvatar,
      score: known ? known.score : null,
      role: known ? known.role : 'user',
      isSuper: known ? !!known.isSuper : false
    },
    photos: targetPhotos.filter(p =>
      p.status === 'approved' ||
      (req.user && (req.user.id === req.params.id || isAdminRole(req.user)))
    )
  });
});

app.get('/upload', ensureAuthenticated, (req, res) => {
  const ban = getBan(req.user);
  if (ban) return res.status(403).send(bannedPageHtml(ban));
  res.render('upload', { user: req.user });
});

app.get('/admin', ensureAdmin, (req, res) => {
  const today = new Date().toDateString();
  const todayPhotos = photos.filter(p => new Date(p.created_at).toDateString() === today);
  const todayApproved = todayPhotos.filter(p => p.status === 'approved');
  res.render('admin', {
    user: req.user,
    pendingPhotos: photos.filter(p => p.status === 'pending'),
    changesPhotos: photos.filter(p => p.status === 'changes_requested'),
    allPhotos: photos,
    allNews: news,
    todayTotal: todayPhotos.length,
    todayApproved: todayApproved.length,
    todayRejected: todayPhotos.filter(p => p.status === 'rejected').length,
    onlineAdmins: onlineAdmins.size
  });
});

app.get('/admin/users', ensureAdmin, (req, res) => {
  const list = [...knownUsers.values()].map(u => {
    const myPhotos = photos.filter(p => p.user_id === u.id);
    const row = {
      id: u.id,
      name: u.name,
      avatar: u.avatar,
      role: u.role,
      isSuper: !!u.isSuper,
      score: u.score,
      uploaded: myPhotos.length,
      approved: myPhotos.filter(p => p.status === 'approved').length,
      pending: myPhotos.filter(p => p.status === 'pending').length,
      rejected: myPhotos.filter(p => p.status === 'rejected').length,
      banned: u.banned || null
    };
    if (req.user.isSuper) row.email = u.email;
    return row;
  });
  list.sort((a, b) => b.approved - a.approved);

  let adminListForView = null;
  if (req.user.isSuper) {
    adminListForView = [
      { name: SUPER_ADMIN.name, email: SUPER_ADMIN.email, isSuper: true },
      ...ADMIN_LIST.map(a => ({ name: a.name, email: a.email, isSuper: false }))
    ];
  }

  res.render('admin-users', {
    user: req.user,
    members: list,
    adminList: adminListForView
  });
});

// 👤 管理員睇單個會員嘅詳細上載紀錄
app.get('/admin/user/:id', ensureAdmin, (req, res) => {
  const target = knownUsers.get(req.params.id);
  const targetPhotos = photos.filter(p => p.user_id === req.params.id)
    .sort((a, b) => b.id - a.id);
  if (!target && targetPhotos.length === 0) {
    return res.status(404).send('<h1 style="font-family:sans-serif;text-align:center;margin-top:80px;">搵唔到呢個會員 😢</h1>');
  }
  const total = targetPhotos.length;
  const approved = targetPhotos.filter(p => p.status === 'approved').length;
  const pending = targetPhotos.filter(p => p.status === 'pending').length;
  const changes = targetPhotos.filter(p => p.status === 'changes_requested').length;
  const rejected = targetPhotos.filter(p => p.status === 'rejected').length;
  const reviewed = approved + rejected;
  const member = {
    id: req.params.id,
    name: target ? target.name : (targetPhotos.length > 0 ? targetPhotos[0].user_name : '用戶'),
    avatar: target ? target.avatar : '',
    role: target ? target.role : 'user',
    isSuper: target ? !!target.isSuper : false,
    score: target ? target.score : null,
    banned: target && target.banned ? target.banned : null,
    email: (req.user.isSuper && target) ? target.email : null
  };
  res.render('admin-user-detail', {
    user: req.user,
    member: member,
    memberPhotos: targetPhotos,
    stats: { total, approved, pending, changes, rejected, reviewed, rate: reviewed > 0 ? Math.round((approved / reviewed) * 100) : null }
  });
});

// 📊 功能9：統計儀表板（獨立新分頁，管理員＋總管理員）
// 📈 功能10：審核員工作量（總管理員睇全部，普通管理員睇自己）
app.get('/admin/stats', ensureAdmin, (req, res) => {
  const totalPhotos = photos.length;
  const approvedCount = photos.filter(p => p.status === 'approved').length;
  const pendingCount = photos.filter(p => p.status === 'pending').length;
  const changesCount = photos.filter(p => p.status === 'changes_requested').length;
  const rejectedCount = photos.filter(p => p.status === 'rejected').length;
  const reviewed = approvedCount + rejectedCount;
  const rate = reviewed > 0 ? Math.round((approvedCount / reviewed) * 100) : 0;
  const featured = photos.filter(p => p.is_featured && p.status === 'approved').length;
  const members = knownUsers.size;
  const bannedCount = [...knownUsers.values()].filter(u => u.banned).length;
  const newsApproved = news.filter(n => n.status === 'approved').length;
  const newsPending = news.filter(n => n.status === 'pending').length;

  // 近 14 日上載／通過趨勢
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i); const key = d.toDateString();
    days.push({ label: (d.getMonth() + 1) + '/' + d.getDate(),
      uploads: photos.filter(p => new Date(p.created_at).toDateString() === key).length,
      approved: photos.filter(p => p.status === 'approved' && p.reviewed_at && new Date(p.reviewed_at).toDateString() === key).length });
  }
  const maxDay = Math.max(1, ...days.map(d => d.uploads), ...days.map(d => d.approved));

  // 塗裝分類分佈（已通過）
  const catNames = { standard: '普通塗裝', special: '彩繪', cargo: '貨機', 'cargo-special': '貨機彩繪', military: '軍機', private: '私人飛機', heli: '直升機', retro: '復古塗裝', airport: '機場', terminal: '客運大樓', ground: '地勤' };
  const approvedPhotos = photos.filter(p => p.status === 'approved');
  const catCounts = CATEGORIES.map(c => ({ key: c, name: catNames[c] || c, count: approvedPhotos.filter(p => p.category === c).length }));
  const maxCat = Math.max(1, ...catCounts.map(c => c.count));

  // 上載者排行（頭 10 名）
  const upMap = {};
  approvedPhotos.forEach(p => { upMap[p.user_name] = (upMap[p.user_name] || 0) + 1; });
  const topUploaders = Object.entries(upMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10);

  // 📈 功能10：審核員工作量
  const reviewerMap = {};
  function addReview(name, type, time) {
    if (!name) return;
    if (!reviewerMap[name]) reviewerMap[name] = { name: name, approved: 0, rejected: 0, changes: 0, newsDone: 0, total: 0, last: null };
    const r = reviewerMap[name];
    r.total++;
    if (type === 'approved') r.approved++;
    else if (type === 'rejected') r.rejected++;
    else if (type === 'changes') r.changes++;
    else if (type === 'news') r.newsDone++;
    if (time && (!r.last || time > r.last)) r.last = time;
  }
  photos.forEach(p => {
    if (!p.reviewed_by) return;
    if (p.status === 'approved') addReview(p.reviewed_by, 'approved', p.reviewed_at);
    else if (p.status === 'rejected') addReview(p.reviewed_by, 'rejected', p.reviewed_at);
    else if (p.status === 'changes_requested') addReview(p.reviewed_by, 'changes', p.reviewed_at);
  });
  news.forEach(n => {
    if (n.reviewed_by && (n.status === 'approved' || n.status === 'rejected')) addReview(n.reviewed_by, 'news', n.reviewed_at);
  });
  let reviewers = Object.values(reviewerMap).sort((a, b) => b.total - a.total);
  // 普通管理員只睇到自己嘅工作量；總管理員睇晒全部
  if (!(req.user && req.user.isSuper)) {
    reviewers = reviewers.filter(r => r.name === req.user.name);
  }

  res.render('admin-stats', { user: req.user, totalPhotos, approvedCount, pendingCount, changesCount, rejectedCount, rate, featured, members, bannedCount, newsApproved, newsPending, days, maxDay, catCounts, maxCat, topUploaders, reviewers });
});

// 相片詳情頁（包上載者＋審核員嘅頭像同身份）
app.get('/photo/:id', (req, res) => {
  const photo = photos.find(p => p.id === parseInt(req.params.id));
  if (!photo) {
    return res.status(404).send('<h1 style="font-family:sans-serif;text-align:center;margin-top:80px;">搵唔到呢張相 😢</h1>');
  }
  const isOwner = req.user && req.user.id === photo.user_id;
  const isAdmin = isAdminRole(req.user);
  if (photo.status !== 'approved' && !isOwner && !isAdmin) {
    return res.status(403).send('<h1 style="font-family:sans-serif;text-align:center;margin-top:80px;">403 — 呢張相未公開 🚫</h1>');
  }

  // 上載者資料（頭像＋身份）
  const up = knownUsers.get(photo.user_id);
  const uploader = up
    ? { id: up.id, name: up.name, avatar: up.avatar, role: up.role, isSuper: !!up.isSuper }
    : { id: photo.user_id, name: photo.user_name, avatar: '', role: 'user', isSuper: false };

  // 審核員資料（用名稱搵返佢嘅帳號）
  let reviewer = null;
  if (photo.reviewed_by) {
    for (const u of knownUsers.values()) {
      if (u.name === photo.reviewed_by) {
        reviewer = { id: u.id, name: u.name, avatar: u.avatar, role: u.role, isSuper: !!u.isSuper };
        break;
      }
    }
    if (!reviewer) {
      reviewer = { id: '', name: photo.reviewed_by, avatar: '', role: 'admin', isSuper: photo.reviewed_by === SUPER_ADMIN.name };
    }
  }

  const photoComments = comments.filter(c => c.photo_id === photo.id)
    .sort((a, b) => a.id - b.id);
  const likedBy = photo.liked_by || [];
  const meKnown = req.user ? knownUsers.get(req.user.id) : null;
  res.render('detail', {
    user: req.user,
    photo,
    uploader,
    reviewer,
    photoComments: photoComments,
    likeCount: likedBy.length,
    liked: req.user ? likedBy.includes(req.user.id) : false,
    favorited: meKnown && meKnown.favorites ? meKnown.favorites.includes(photo.id) : false
  });
});

// ============================================
// API 路由
// ============================================

app.get('/api/stats/today', (req, res) => {
  const today = new Date().toDateString();
  const todayPhotos = photos.filter(p => new Date(p.created_at).toDateString() === today);
  const approved = todayPhotos.filter(p => p.status === 'approved').length;
  const rejected = todayPhotos.filter(p => p.status === 'rejected').length;
  const total = todayPhotos.length;
  const galleryTotal = photos.filter(p => p.status === 'approved').length;
  const allApproved = photos.filter(p => p.status === 'approved').length;
  const allReviewed = photos.filter(p => p.status !== 'pending' && p.status !== 'changes_requested').length;
  const todayRate = total > 0 ? Math.round((approved / total) * 100) : 0;
  const overallRate = allReviewed > 0 ? Math.round((allApproved / allReviewed) * 100) : 0;
  res.json({ total, approved, rejected, galleryTotal, todayRate, overallRate });
});

app.get('/api/online-admins', (req, res) => {
  res.json({ count: onlineAdmins.size });
});

app.get('/api/airport-name', (req, res) => {
  const code = (req.query.code || '').trim().toUpperCase();
  res.json({ name: airportDB[code] || null });
});

app.get('/api/airline-name', (req, res) => {
  const q = (req.query.q || '').trim();
  res.json({ name: findInDB(airlineDB, q) });
});

app.get('/api/aircraft-type', (req, res) => {
  const q = (req.query.q || '').trim();
  res.json({ name: findInDB(aircraftTypeDB, q) });
});

app.get('/api/aircraft-info', async (req, res) => {
  const reg = (req.query.reg || '').trim();
  if (!reg) return res.json({ found: false });
  const tryFetch = async (url, mapFn) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const r = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!r.ok) return null;
      return mapFn(await r.json());
    } catch (e) {
      clearTimeout(timer);
      return null;
    }
  };
  let info = await tryFetch('https://api.adsbdb.com/v0/aircraft/' + encodeURIComponent(reg), d => {
    if (!d || !d.response || !d.response.aircraft) return null;
    const a = d.response.aircraft;
    return {
      found: true,
      registration: a.registration || reg,
      airline: findInDB(airlineDB, a.airline || '') || a.airline || '',
      type: findInDB(aircraftTypeDB, a.type || '') || a.type || '',
      source: 'adsbdb'
    };
  });
  if (!info) {
    info = await tryFetch('https://api.planespotters.net/pub/photos/reg/' + encodeURIComponent(reg), d => {
      if (!d || !d.photos || d.photos.length === 0) return null;
      const p = d.photos[0];
      return {
        found: true,
        registration: reg,
        airline: findInDB(airlineDB, p.airline || '') || p.airline || '',
        type: findInDB(aircraftTypeDB, p.aircraft_type || '') || p.aircraft_type || '',
        source: 'planespotters'
      };
    });
  }
  res.json(info || { found: false });
});

app.get('/api/photos', (req, res) => {
  const isAdmin = isAdminRole(req.user);
  const list = photos.filter(p =>
    p.status === 'approved' ||
    (req.user && (p.user_id === req.user.id || isAdmin))
  );
  res.json(list);
});

app.get('/api/featured', (req, res) => {
  res.json(photos.filter(p => p.status === 'approved' && p.is_featured));
});

app.get('/api/my-photos', ensureAuthenticated, (req, res) => {
  res.json(photos.filter(p => p.user_id === req.user.id));
});

app.get('/api/admin/photos', ensureAdmin, (req, res) => {
  res.json(photos);
});

app.get('/api/news', (req, res) => {
  res.json(news.filter(n => n.status === 'approved').sort((a, b) => b.id - a.id));
});

app.get('/api/user/:id/public', (req, res) => {
  const known = knownUsers.get(req.params.id);
  const targetPhotos = photos.filter(p => p.user_id === req.params.id && p.status === 'approved');
  res.json({
    id: req.params.id,
    name: known ? known.name : (targetPhotos.length > 0 ? targetPhotos[0].user_name : '用戶'),
    score: known ? known.score : null,
    photoCount: targetPhotos.length
  });
});

app.post('/api/settings/notifications', ensureAuthenticated, (req, res) => {
  const me = knownUsers.get(req.user.id);
  if (!me) return res.status(404).json({ error: '搵唔到用戶' });
  me.notify = {
    login: !!req.body.login,
    review: !!req.body.review
  };
  saveDB();
  res.json({ ok: true, notify: me.notify });
});

app.post('/api/superadmin/score', ensureSuperAdmin, (req, res) => {
  const target = knownUsers.get(req.body.userId);
  if (!target) return res.status(404).json({ error: '搵唔到會員' });
  if (target.role === 'admin') return res.status(400).json({ error: '管理員另計，唔使加分' });
  const delta = parseInt(req.body.delta);
  if (delta !== 1 && delta !== -1) return res.status(400).json({ error: '無效分數' });
  target.score = (target.score == null ? START_SCORE : target.score) + delta;
  scoreHistory.push({
    user_id: target.id,
    user_name: target.name,
    delta: delta,
    score_after: target.score,
    reason: '總管理員手動調整',
    by: req.user.name,
    at: new Date().toISOString()
  });
  console.log('[SCORE] 總管理員幫 ' + target.name + ' ' + (delta > 0 ? '+1' : '−1') + ' → ' + target.score);
  saveDB();
  res.json({ ok: true, score: target.score });
});

app.post('/api/superadmin/admins', ensureSuperAdmin, (req, res) => {
  const name = (req.body.name || '').trim();
  const email = (req.body.email || '').trim();
  if (!name || !email) return res.status(400).json({ error: '要填晒名稱同電郵' });
  const exists = ADMIN_LIST.find(a => a.email.toLowerCase() === email.toLowerCase());
  const isSuper = email.toLowerCase() === SUPER_ADMIN.email.toLowerCase();
  if (exists || isSuper) return res.status(400).json({ error: '呢個電郵已經係管理員' });
  const newAdmin = { name: name, email: email };
  ADMIN_LIST.push(newAdmin);
  dynamicAdmins.push(newAdmin);
  console.log('[SUPER ADMIN] 新增管理員：' + name + ' (' + email + ')');
  saveDB();
  res.json({ ok: true });
});

app.post('/api/superadmin/admins/remove', ensureSuperAdmin, (req, res) => {
  const email = (req.body.email || '').trim();
  if (email.toLowerCase() === SUPER_ADMIN.email.toLowerCase()) {
    return res.status(400).json({ error: '唔可以刪除總管理員自己！' });
  }
  const idx = ADMIN_LIST.findIndex(a => a.email.toLowerCase() === email.toLowerCase());
  if (idx === -1) return res.status(404).json({ error: '搵唔到呢個管理員' });
  const removed = ADMIN_LIST.splice(idx, 1)[0];
  const dynIdx = dynamicAdmins.findIndex(a => a.email.toLowerCase() === email.toLowerCase());
  if (dynIdx !== -1) dynamicAdmins.splice(dynIdx, 1);
  for (const u of knownUsers.values()) {
    if (u.email && u.email.toLowerCase() === email.toLowerCase()) {
      u.role = 'user';
      u.isSuper = false;
      if (u.score == null) u.score = START_SCORE;
    }
  }
  console.log('[SUPER ADMIN] 刪除管理員：' + removed.name + ' (' + removed.email + ')');
  saveDB();
  res.json({ ok: true });
});

// ============================================
// 📢 功能11：公告板（總管理員新增／刪除）
// ============================================
app.post('/api/superadmin/announcements', ensureSuperAdmin, (req, res) => {
  const title = (req.body.title || '').trim();
  const content = (req.body.content || '').trim();
  if (!title || !content) return res.status(400).json({ error: '標題同內容都要填' });
  announcements.push({
    id: annIdCounter++,
    title: title,
    content: content,
    created_by: req.user.name,
    created_at: new Date().toISOString()
  });
  console.log('[ANN] ' + req.user.name + ' 發佈咗新公告：' + title);
  saveDB();
  res.json({ ok: true });
});

app.post('/api/superadmin/announcements/:id/delete', ensureSuperAdmin, (req, res) => {
  const idx = announcements.findIndex(a => a.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: '搵唔到呢則公告' });
  const removed = announcements.splice(idx, 1)[0];
  console.log('[ANN] ' + req.user.name + ' 刪除咗公告：' + removed.title);
  saveDB();
  res.json({ ok: true });
});

// ============================================
// 🚫 封鎖／解封用戶（管理員＋總管理員）
// ============================================
app.post('/api/admin/users/:id/ban', ensureAdmin, (req, res) => {
  const target = knownUsers.get(req.params.id);
  if (!target) return res.status(404).json({ error: '搵唔到呢個會員' });
  if (target.role === 'admin') return res.status(400).json({ error: '唔可以封鎖管理員' });
  if (target.id === req.user.id) return res.status(400).json({ error: '唔可以封鎖自己' });
  const reason = (req.body.reason || '').trim();
  if (!reason) return res.status(400).json({ error: '封鎖用戶一定要填寫原因' });
  target.banned = {
    reason: reason,
    by: req.user.name,
    at: new Date().toISOString()
  };
  console.log('[BAN] ' + req.user.name + ' 封鎖咗 ' + target.name + '，原因：' + reason);
  saveDB();

  // 寄封鎖通知電郵俾用戶
  if (target.email) {
    sendEmail(
      target.email,
      '🚫 你嘅帳號已被封鎖 — cxhkgcxvhhh Aviation enthusiast Club',
      buildEmailHtml({
        color: '#c62828',
        icon: '🚫',
        title: '帳號已被封鎖',
        bodyHtml:
          '<p style="margin:0 0 18px;">你好 <b>' + target.name + '</b>，</p>' +
          '<p style="margin:0 0 18px;">你嘅帳號已被管理員封鎖，封鎖期間你將無法上載相片。</p>' +
          '<div style="background:#fff5f5;border:1px solid #f5c6c6;border-radius:12px;padding:14px 18px;margin-bottom:18px;">' +
            '<b style="color:#c62828;font-size:13px;">封鎖原因</b>' +
            '<div style="color:#34495e;font-size:14px;margin-top:6px;">' + reason + '</div>' +
          '</div>' +
          '<div style="background:#f4f8fc;border-radius:12px;padding:6px 18px;margin-bottom:18px;">' +
            infoRow('👑 執行管理員', req.user.name) +
            infoRow('🕐 時間', new Date().toLocaleString('zh-HK')) +
          '</div>' +
          '<p style="margin:0;font-size:13px;color:#5f7285;">如果你認為有誤會，可以電郵 <a href="mailto:' + APPEAL_EMAIL + '" style="color:#1976d2;">' + APPEAL_EMAIL + '</a> 提出申訴。</p>'
      })
    );
  }
  res.json({ ok: true });
});

app.post('/api/admin/users/:id/unban', ensureAdmin, (req, res) => {
  const target = knownUsers.get(req.params.id);
  if (!target) return res.status(404).json({ error: '搵唔到呢個會員' });
  if (!target.banned) return res.status(400).json({ error: '呢個會員冇被封鎖' });
  target.banned = null;
  console.log('[UNBAN] ' + req.user.name + ' 解除咗 ' + target.name + ' 嘅封鎖');
  saveDB();

  if (target.email) {
    sendEmail(
      target.email,
      '✅ 你嘅帳號已解除封鎖 — cxhkgcxvhhh Aviation enthusiast Club',
      buildEmailHtml({
        color: '#2e7d32',
        icon: '✅',
        title: '帳號已解除封鎖',
        bodyHtml:
          '<p style="margin:0 0 18px;">你好 <b>' + target.name + '</b>！</p>' +
          '<p style="margin:0 0 18px;">你嘅帳號已經解除封鎖，而家可以照常上載相片喇 ✈️</p>' +
          '<div style="background:#f4f8fc;border-radius:12px;padding:6px 18px;margin-bottom:18px;">' +
            infoRow('👑 執行管理員', req.user.name) +
            infoRow('🕐 時間', new Date().toLocaleString('zh-HK')) +
          '</div>' +
          '<p style="margin:0;font-size:13px;color:#5f7285;">記得遵守審圖標準，繼續分享精彩作品！</p>'
      })
    );
  }
  res.json({ ok: true });
});

// 用戶自己查封鎖狀態（頂欄紅色提示用）
app.get('/api/my-ban-status', ensureAuthenticated, (req, res) => {
  const ban = getBan(req.user);
  res.json({ banned: !!ban, reason: ban ? ban.reason : '', by: ban ? ban.by : '', at: ban ? ban.at : '' });
});

// ============================================
// POST 路由
// ============================================

// 上傳相片（除咗「相機設定」同「額外資料」，其他全部必填）
app.post('/upload', ensureAuthenticated, upload.single('photo'), async (req, res) => {
  const ban = getBan(req.user);
  if (ban) return res.status(403).send(bannedPageHtml(ban));
  if (!req.file) return res.redirect('/upload?error=missing');

  // ⏱️ 功能16：每個用戶每日最多上載 20 張
  const todayStr = new Date().toDateString();
  const todayCount = photos.filter(p => p.user_id === req.user.id && new Date(p.created_at).toDateString() === todayStr).length;
  if (todayCount >= 20) {
    return res.redirect('/upload?error=limit');
  }

  // 🏷️ 功能13：新分類（機場／客運大樓／地勤）有唔同嘅必填欄位
  const upCat = req.body.category;
  let required = ['title', 'registration', 'airline', 'flight_number', 'aircraft_type', 'livery', 'origin', 'destination', 'photo_date', 'location'];
  let errTab = '';
  if (upCat === 'airport') { required = ['title', 'airport_code', 'photo_date', 'location']; errTab = '&tab=airport'; }
  else if (upCat === 'terminal') { required = ['title', 'airport_code', 'terminal_name', 'photo_date', 'location']; errTab = '&tab=terminal'; }
  else if (upCat === 'ground') { required = ['title', 'airport_code', 'ground_type', 'photo_date', 'location']; errTab = '&tab=ground'; }
  const missing = required.filter(f => !(req.body[f] || '').trim());
  if (missing.length > 0) {
    return res.redirect('/upload?error=missing' + errTab);
  }

  const imagePath = path.join(__dirname, 'public', 'uploads', req.file.filename);

  // 🤖 加水印之前先讀 EXIF ＋ 分析色彩
  const exifData = await readExif(imagePath);
  const colorInfo = await analyzeColors(imagePath);
  if (exifData) console.log('[EXIF] ' + (exifData.camera || '?') + ' ' + (exifData.shutter || '') + ' ' + (exifData.iso || ''));

  await addWatermark(imagePath, req.user.name);

  const airline = findInDB(airlineDB, req.body.airline) || req.body.airline || '';
  const aircraftType = findInDB(aircraftTypeDB, req.body.aircraft_type) || req.body.aircraft_type || '';
  const category = CATEGORIES.includes(req.body.category)
    ? req.body.category
    : detectCategory(aircraftType, airline, req.body.livery);

  // 如果冇填相機設定，用 EXIF 自動幫佢填
  let cameraSettings = (req.body.camera_settings || '').trim();
  if (!cameraSettings && exifData) {
    cameraSettings = [exifData.camera, exifData.lens, exifData.focal, exifData.aperture, exifData.shutter, exifData.iso]
      .filter(Boolean).join(' · ');
  }

  photos.push({
    id: photoIdCounter++,
    user_id: req.user.id,
    user_name: req.user.name,
    title: req.body.title || '',
    registration: req.body.registration || '',
    airline: airline,
    flight_number: req.body.flight_number || '',
    aircraft_type: aircraftType,
    livery: req.body.livery || '',
    origin: req.body.origin || '',
    destination: req.body.destination || '',
    photo_date: req.body.photo_date || '',
    location: req.body.location || '',
    camera_settings: cameraSettings,
    extra_info: req.body.extra_info || '',
    airport_code: req.body.airport_code || '',
    terminal_name: req.body.terminal_name || '',
    ground_type: req.body.ground_type || '',
    liked_by: [],
    like_milestone: 0,
    admin_note: '',
    category: category,
    image_url: '/uploads/' + req.file.filename,
    exif: exifData,
    colors: colorInfo,
    status: 'pending',
    is_featured: false,
    reject_reason: '',
    reviewed_by: null,
    appeal_count: 0,
    created_at: new Date().toISOString(),
    reviewed_at: null
  });
  saveDB();
  checkPendingAlert();
  res.redirect('/upload?success=1');
});

// 上傳新聞（所有內容必填，包括配圖）
app.post('/upload-news', ensureAuthenticated, upload.single('news_image'), (req, res) => {
  const ban = getBan(req.user);
  if (ban) return res.status(403).send(bannedPageHtml(ban));
  if (!(req.body.title || '').trim() || !(req.body.content || '').trim() ||
      !(req.body.source || '').trim() || !req.file) {
    return res.redirect('/upload?error=news-missing');
  }
  news.push({
    id: newsIdCounter++,
    user_id: req.user.id,
    user_name: req.user.name,
    title: req.body.title || '',
    content: req.body.content || '',
    source: req.body.source || '',
    image_url: '/uploads/' + req.file.filename,
    status: 'pending',
    reviewed_by: null,
    reject_reason: '',
    created_at: new Date().toISOString(),
    reviewed_at: null
  });
  saveDB();
  res.redirect('/upload?news=ok');
});

// 審核相片
app.post('/api/admin/photos/:id/status', ensureAdmin, (req, res) => {
  const photo = photos.find(p => p.id === parseInt(req.params.id));
  if (!photo) return res.status(404).json({ error: '搵唔到相片' });
  const status = req.body.status;
  if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: '無效狀態' });
  const wasPending = photo.status === 'pending' || photo.status === 'changes_requested';
  photo.status = status;
  photo.reviewed_by = req.user.name;
  photo.reviewed_at = new Date().toISOString();
  if (status === 'rejected') photo.reject_reason = req.body.reason || '';
  if (status === 'approved') { photo.reject_reason = ''; photo.admin_note = ''; }
  if (wasPending) {
    adjustScore(photo.user_id, status === 'approved' ? 1 : -1,
      status === 'approved' ? '相片 #' + photo.id + ' 通過審核' : '相片 #' + photo.id + ' 被拒絕',
      req.user.name);
  }
  sendReviewEmail(photo, status);
  saveDB();
  checkPendingAlert();
  res.json({ ok: true });
});

// 👑 管理員直接修改相片資料
app.post('/api/admin/photos/:id/edit', ensureAdmin, (req, res) => {
  const photo = photos.find(p => p.id === parseInt(req.params.id));
  if (!photo) return res.status(404).json({ error: '搵唔到相片' });
  EDITABLE_FIELDS.forEach(f => {
    if (typeof req.body[f] === 'string') photo[f] = req.body[f].trim();
  });
  console.log('[ADMIN EDIT] #' + photo.id + '「' + photo.title + '」由 ' + req.user.name + ' 修改');
  saveDB();
  res.json({ ok: true });
});

// ✏️ 管理員要求補充資料（唔扣分，開放權限畀用戶修改）
app.post('/api/admin/photos/:id/request-changes', ensureAdmin, (req, res) => {
  const photo = photos.find(p => p.id === parseInt(req.params.id));
  if (!photo) return res.status(404).json({ error: '搵唔到相片' });
  const note = (req.body.note || '').trim();
  if (!note) return res.status(400).json({ error: '請寫低需要補充嘅資料' });
  photo.status = 'changes_requested';
  photo.admin_note = note;
  photo.reviewed_by = req.user.name;
  photo.reviewed_at = new Date().toISOString();
  console.log('[CHANGES] #' + photo.id + ' 要求補充資料：' + note);
  sendChangesEmail(photo);
  saveDB();
  checkPendingAlert();
  res.json({ ok: true });
});

// 📝 用戶補充資料後重新提交（返去待審核）
app.post('/api/photos/:id/resubmit', ensureAuthenticated, (req, res) => {
  const photo = photos.find(p => p.id === parseInt(req.params.id));
  if (!photo || photo.user_id !== req.user.id) return res.status(403).json({ error: '無權限' });
  if (photo.status !== 'changes_requested') return res.status(400).json({ error: '呢張相唔需要補充資料' });
  EDITABLE_FIELDS.forEach(f => {
    if (typeof req.body[f] === 'string') photo[f] = req.body[f].trim();
  });
  photo.status = 'pending';
  photo.admin_note = '';
  console.log('[RESUBMIT] #' + photo.id + ' 由 ' + req.user.name + ' 補充資料後重新提交');
  saveDB();
  checkPendingAlert();
  res.json({ ok: true });
});

// 審核新聞
app.post('/api/admin/news/:id/status', ensureAdmin, (req, res) => {
  const item = news.find(n => n.id === parseInt(req.params.id));
  if (!item) return res.status(404).json({ error: '搵唔到新聞' });
  const status = req.body.status;
  if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: '無效狀態' });
  item.status = status;
  item.reviewed_by = req.user.name;
  item.reviewed_at = new Date().toISOString();
  if (status === 'rejected') item.reject_reason = req.body.reason || '';
  if (status === 'approved') item.reject_reason = '';
  saveDB();
  res.json({ ok: true });
});

// ⭐ 精選相片：只有總管理員先可以設定／取消
app.post('/api/admin/photos/:id/featured', ensureSuperAdmin, (req, res) => {
  const photo = photos.find(p => p.id === parseInt(req.params.id));
  if (!photo) return res.status(404).json({ error: '搵唔到相片' });
  photo.is_featured = !!req.body.featured;
  saveDB();
  res.json({ ok: true });
});

app.post('/api/photos/:id/appeal', ensureAuthenticated, (req, res) => {
  const photo = photos.find(p => p.id === parseInt(req.params.id));
  if (!photo || photo.user_id !== req.user.id) return res.status(403).json({ error: '無權限' });
  photo.appeal_count = (photo.appeal_count || 0) + 1;
  saveDB();
  const subject = encodeURIComponent('相片上訴：#' + photo.id + ' ' + photo.title);
  const body = encodeURIComponent(
    '你好，我想就以下被拒之相片提出上訴：\n\n' +
    '相片編號：#' + photo.id + '\n' +
    '標題：' + photo.title + '\n' +
    '拒絕原因：' + (photo.reject_reason || '無') + '\n\n' +
    '上訴理由：\n（請喺度寫低你嘅理由）\n\n' +
    '—— ' + req.user.name
  );
  res.json({ ok: true, mailto: 'mailto:' + APPEAL_EMAIL + '?subject=' + subject + '&body=' + body });
});

// ============================================
// 📜 功能20：分數紀錄頁（自己睇自己；管理員睇晒全部）
// ============================================
app.get('/score-history', ensureAuthenticated, (req, res) => {
  const isAdmin = isAdminRole(req.user);
  const records = (isAdmin ? scoreHistory : scoreHistory.filter(r => r.user_id === req.user.id))
    .slice().reverse();
  res.render('score-history', { user: req.user, records: records, isAdminView: isAdmin });
});

// ============================================
// 🔐 功能15：登入紀錄（管理員＋總管理員；電郵只有總管理員睇到）
// ============================================
app.get('/admin/logins', ensureAdmin, (req, res) => {
  const records = loginRecords.slice().reverse().map(r => ({
    name: r.name,
    email: req.user.isSuper ? r.email : null,
    role: r.role,
    isSuper: !!r.isSuper,
    at: r.at
  }));
  res.render('admin-logins', { user: req.user, records: records });
});

// ============================================
// 💬 功能17：留言區
// ============================================
app.post('/api/photos/:id/comment', ensureAuthenticated, (req, res) => {
  const photo = photos.find(p => p.id === parseInt(req.params.id));
  if (!photo) return res.status(404).json({ error: '搵唔到相片' });
  const text = (req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: '留言唔可以空白' });
  if (text.length > 500) return res.status(400).json({ error: '留言太長（最多 500 字）' });
  comments.push({
    id: commentIdCounter++,
    photo_id: photo.id,
    user_id: req.user.id,
    user_name: req.user.name,
    avatar: req.user.avatar || '',
    text: text,
    created_at: new Date().toISOString()
  });
  saveDB();
  res.json({ ok: true });
});

app.post('/api/comments/:id/delete', ensureAuthenticated, (req, res) => {
  const idx = comments.findIndex(c => c.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: '搵唔到留言' });
  const c = comments[idx];
  if (c.user_id !== req.user.id && !isAdminRole(req.user)) {
    return res.status(403).json({ error: '只可以刪除自己嘅留言' });
  }
  comments.splice(idx, 1);
  saveDB();
  res.json({ ok: true });
});

// ============================================
// ❤️ 功能18：讚好（每 5 個讚相片主人 +1 分）＋ ⭐ 收藏
// ============================================
app.post('/api/photos/:id/like', ensureAuthenticated, (req, res) => {
  const photo = photos.find(p => p.id === parseInt(req.params.id));
  if (!photo) return res.status(404).json({ error: '搵唔到相片' });
  if (!photo.liked_by) photo.liked_by = [];
  const i = photo.liked_by.indexOf(req.user.id);
  let liked;
  if (i === -1) { photo.liked_by.push(req.user.id); liked = true; }
  else { photo.liked_by.splice(i, 1); liked = false; }
  // 每集夠 5 個讚，相片主人 +1 分（只會加，唔會因為收回讚而扣分）
  const milestone = Math.floor(photo.liked_by.length / 5);
  const prev = photo.like_milestone || 0;
  if (milestone > prev) {
    adjustScore(photo.user_id, milestone - prev, '相片 #' + photo.id + ' 集夠 ' + (milestone * 5) + ' 個讚', '讚好系統');
    photo.like_milestone = milestone;
  }
  saveDB();
  res.json({ ok: true, liked: liked, likeCount: photo.liked_by.length });
});

app.post('/api/photos/:id/favorite', ensureAuthenticated, (req, res) => {
  const photo = photos.find(p => p.id === parseInt(req.params.id));
  if (!photo) return res.status(404).json({ error: '搵唔到相片' });
  const me = knownUsers.get(req.user.id);
  if (!me) return res.status(404).json({ error: '搵唔到用戶' });
  if (!me.favorites) me.favorites = [];
  const i = me.favorites.indexOf(photo.id);
  let favorited;
  if (i === -1) { me.favorites.push(photo.id); favorited = true; }
  else { me.favorites.splice(i, 1); favorited = false; }
  saveDB();
  res.json({ ok: true, favorited: favorited });
});

// ============================================
// 👥 功能19：追蹤用戶
// ============================================
app.post('/api/users/:id/follow', ensureAuthenticated, (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: '唔可以追蹤自己' });
  const target = knownUsers.get(req.params.id);
  if (!target) return res.status(404).json({ error: '搵唔到呢個用戶' });
  const me = knownUsers.get(req.user.id);
  if (!me) return res.status(404).json({ error: '搵唔到用戶' });
  if (!me.following) me.following = [];
  const i = me.following.indexOf(req.params.id);
  let following;
  if (i === -1) { me.following.push(req.params.id); following = true; }
  else { me.following.splice(i, 1); following = false; }
  saveDB();
  res.json({ ok: true, following: following });
});

// ============================================
// 🗑️ 功能21：永久刪除相片（只有總管理員，會留低紀錄）
// ============================================
app.post('/api/superadmin/photos/:id/delete', ensureSuperAdmin, (req, res) => {
  const idx = photos.findIndex(p => p.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: '搵唔到相片' });
  const photo = photos.splice(idx, 1)[0];
  // 連留言都一齊清走
  comments = comments.filter(c => c.photo_id !== photo.id);
  // 所有人嘅收藏入面移除
  for (const u of knownUsers.values()) {
    if (u.favorites) u.favorites = u.favorites.filter(fid => fid !== photo.id);
  }
  // 刪除硬碟上嘅圖片檔案
  try {
    const filePath = path.join(__dirname, 'public', photo.image_url.replace(/^\//, ''));
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (err) {
    console.error('[DELETE] 刪除圖片檔案失敗：', err.message);
  }
  deletedPhotos.push({
    photo_id: photo.id,
    title: photo.title,
    user_name: photo.user_name,
    deleted_by: req.user.name,
    at: new Date().toISOString()
  });
  console.log('[DELETE] 🗑️ 總管理員 ' + req.user.name + ' 永久刪除咗相片 #' + photo.id + '「' + photo.title + '」（上載者：' + photo.user_name + '）');
  saveDB();
  res.json({ ok: true });
});

// 🗑️ 永久刪除新聞（只有總管理員）：新聞記錄＋圖片檔案一齊消失
app.post('/api/superadmin/news/:id/delete', ensureSuperAdmin, (req, res) => {
  const idx = news.findIndex(n => n.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: '搵唔到新聞' });
  const item = news.splice(idx, 1)[0];
  // 刪除硬碟上嘅新聞圖片
  try {
    if (item.image_url) {
      const filePath = path.join(__dirname, 'public', item.image_url.replace(/^\//, ''));
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error('[DELETE] 刪除新聞圖片失敗：', err.message);
  }
  deletedPhotos.push({
    type: 'news',
    news_id: item.id,
    title: item.title,
    user_name: item.user_name,
    deleted_by: req.user.name,
    at: new Date().toISOString()
  });
  console.log('[DELETE] 🗑️ 總管理員 ' + req.user.name + ' 永久刪除咗新聞 #' + item.id + '「' + item.title + '」（發佈者：' + item.user_name + '）');
  saveDB();
  res.json({ ok: true });
});

// ============================================
// 404 處理
// ============================================
app.use((req, res) => {
  res.status(404).send('<h1 style="font-family:sans-serif;text-align:center;margin-top:80px;">404 — 搵唔到呢一頁 😢</h1><p style="text-align:center;font-family:sans-serif;"><a href="/" style="color:#1976d2;">返回首頁</a></p>');
});

// ============================================
// 啟動伺服器
// ============================================
app.listen(PORT, () => {
  console.log('============================================');
  console.log('  cxhkgcxvhhh Aviation enthusiast Club');
  console.log('  🗑️ 新聞永久刪除 API 已啟用（總管理員）');
  console.log('  正式運行中：http://localhost:' + PORT);
  console.log('  總管理員：' + SUPER_ADMIN.email);
  console.log('  管理員：' + ADMIN_LIST.map(a => a.email).join(', '));
  console.log('  📧 彩色電郵功能已啟用（寄件：' + GMAIL_USER + '）');
  console.log('  🤖 EXIF 自動識別＋色彩分析＋色域圖已啟用');
  console.log('  🏷️ 塗裝類型標籤已啟用（11 款：普通塗裝／彩繪／貨機／貨機彩繪／軍機／私人飛機／直升機／復古塗裝／機場／客運大樓／地勤）');
  console.log('  💾 硬碟資料保存已啟用（data/database.json，重啟唔會冇資料）');
  console.log('  🚫 封鎖用戶功能已啟用（封鎖時必須填寫原因）');
  console.log('  👤 會員詳細紀錄頁已啟用（/admin/user/:id）');
  console.log('  📬 積壓通知已啟用（待審核超過 10 張先 email 管理員）');
  console.log('  ⭐ 精選圖片已改為總管理員專用');
  console.log('  📊 統計儀表板已啟用（/admin/stats）');
  console.log('  📈 審核員工作量統計已啟用（總管理員睇全部，管理員睇自己）');
  console.log('  📢 公告板已啟用（總管理員新增／刪除，會員登入後彈一次）');
  console.log('  🖼️ 首頁輪播已啟用（輪播顯示精選相片，後台「精選／輪播」分頁管理）');
  console.log('  🏷️ 新分類已啟用（機場／客運大樓／地勤，上載頁有專用表格）');
  console.log('  🔐 登入紀錄已啟用（/admin/logins，管理員專用）');
  console.log('  ⏱️ 上載上限已啟用（每人每日 20 張）');
  console.log('  💬 相片留言區已啟用');
  console.log('  ❤️ 讚好＋收藏已啟用（每 5 個讚相片主人 +1 分）');
  console.log('  👥 追蹤功能已啟用（個人檔案睇追蹤中＋收藏）');
  console.log('  📜 分數紀錄頁已啟用（/score-history）');
  console.log('  🗑️ 永久刪相已啟用（只限總管理員，會留低紀錄）');
  console.log('============================================');
});