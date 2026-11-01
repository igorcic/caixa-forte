const { app, BrowserWindow, shell, Menu, ipcMain, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const db = require('./db');

/* ---------- Configuração da conexão (senha criptografada pelo sistema operacional) ---------- */
const cfgPath = () => path.join(app.getPath('userData'), 'conexao.json');
const PADRAO = { host: 'localhost', port: 5432, database: 'caixaforte', user: 'postgres', password: '', ssl: false };

function lerConfig() {
  try {
    const c = JSON.parse(fs.readFileSync(cfgPath(), 'utf8'));
    if (c.passwordEnc && safeStorage.isEncryptionAvailable())
      c.password = safeStorage.decryptString(Buffer.from(c.passwordEnc, 'base64'));
    delete c.passwordEnc;
    return { ...PADRAO, ...c };
  } catch { return { ...PADRAO }; }
}
function gravarConfig(c) {
  const out = { ...c };
  if (safeStorage.isEncryptionAvailable()) {
    out.passwordEnc = safeStorage.encryptString(c.password || '').toString('base64');
    delete out.password;
  }
  fs.mkdirSync(path.dirname(cfgPath()), { recursive: true });
  fs.writeFileSync(cfgPath(), JSON.stringify(out, null, 2));
}

let ultimoErro = '';
const msgErro = e => {
  const m = { ECONNREFUSED: 'O PostgreSQL não respondeu nesse endereço. Ele está instalado e rodando?',
    ENOTFOUND: 'Servidor não encontrado. Confira o endereço.', '28P01': 'Usuário ou senha incorretos.',
    '28000': 'Acesso negado para esse usuário.', '42501': 'O usuário não tem permissão para criar o banco ou as tabelas.' };
  return m[e.code] || e.message || String(e);
};

/* ---------- IPC ---------- */
ipcMain.handle('db:status', () => ({ conectado: db.ready(), erro: ultimoErro, config: { ...lerConfig(), password: undefined } }));
ipcMain.handle('db:getConfig', () => { const c = lerConfig(); return { ...c, password: c.password ? '••••••' : '' }; });
ipcMain.handle('db:connect', async (_e, cfg) => {
  const atual = lerConfig();
  const novo = { ...atual, ...cfg };
  if (cfg.password === '••••••') novo.password = atual.password; // manteve a senha salva
  try { const r = await db.connect(novo); gravarConfig(novo); ultimoErro = ''; return r; }
  catch (e) { ultimoErro = msgErro(e); return { ok: false, erro: ultimoErro }; }
});
const guard = fn => async (_e, arg) => {
  if (!db.ready()) return { ok: false, erro: 'Sem conexão com o banco.' };
  try { return { ok: true, data: await fn(arg) }; } catch (e) { ultimoErro = msgErro(e); return { ok: false, erro: ultimoErro }; }
};
ipcMain.handle('db:load', guard(() => db.load()));
ipcMain.handle('db:saveAll', guard(st => db.saveAll(st)));
ipcMain.handle('db:logRelatorio', guard(r => db.logRelatorio(r)));
ipcMain.handle('db:listRelatorios', guard(() => db.listRelatorios()));

/* ---------- Janela ---------- */
function criarJanela() {
  const win = new BrowserWindow({
    width: 1360, height: 860, minWidth: 900, minHeight: 600,
    title: 'Caixa Forte', backgroundColor: '#EEF2F0', autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  win.webContents.session.on('will-download', (_e, item) => {
    item.setSaveDialogOptions({ title: 'Salvar relatório', filters: [{ name: 'Planilha Excel', extensions: ['xlsx'] }] });
  });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
}

Menu.setApplicationMenu(null);
app.whenReady().then(async () => {
  try { await db.connect(lerConfig()); } catch (e) { ultimoErro = msgErro(e); } // tenta conectar com a última configuração
  criarJanela();
});
app.on('window-all-closed', async () => { await db.close(); if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) criarJanela(); });
