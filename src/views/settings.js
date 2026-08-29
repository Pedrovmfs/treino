import { el, toast, confirmAction, fmtDate, num } from '../ui.js';
import { screen, card } from './layout.js';
import { navigate } from '../router.js';
import * as store from '../store.js';
import * as db from '../db.js';
import { applyTheme } from '../theme.js';
import { wakeLockSupported } from '../wakelock.js';
import { APP_VERSION, checkForUpdate } from '../update.js';
import { setRestNotify } from '../components/restTimer.js';
import * as profiles from '../profiles.js';

const toggle = (on, onClick) => el('button', {
  class: 'btn-sm' + (on ? ' btn-primary' : ''), style: 'min-width:64px', onclick: onClick,
}, on ? 'ON' : 'OFF');

export function settings() {
  const kids = [];

  kids.push(profilesCard());

  // treino
  const restOn = store.getMeta('restTimerOn', true);
  const awake = store.getMeta('keepAwake', true);
  const rirOn = store.getMeta('trackRIR', false);
  const notifyOn = store.getMeta('restNotify', true)
    && typeof Notification !== 'undefined' && Notification.permission === 'granted';
  const restField = (key, label, dflt) => el('div', { class: 'row between', style: 'gap:10px' },
    el('label', { style: 'margin:0;flex:1' }, label),
    el('input', {
      type: 'text', inputmode: 'numeric', style: 'width:70px;text-align:center',
      value: store.getMeta(key, dflt),
      onchange: (e) => store.setMeta(key, Math.max(0, parseInt(e.target.value, 10) || dflt)),
    }),
    el('small', {}, 's'));
  kids.push(card({},
    el('h3', {}, 'Treino'),
    el('div', { class: 'row between', style: 'margin-bottom:8px' },
      el('label', { style: 'margin:0' }, 'Timer de descanso ao marcar série'),
      toggle(restOn, async () => { await store.setMeta('restTimerOn', !restOn); navigate('/settings'); })),
    restOn ? el('div', { class: 'stack', style: 'margin:8px 0 12px' },
      restField('restWork', 'Descanso após válida', 120),
      restField('restPrep', 'Descanso após prep', 75),
      restField('restWarmup', 'Descanso após aquecimento', 45),
    ) : null,
    restOn ? el('div', { class: 'row between', style: 'margin-bottom:8px' },
      el('label', { style: 'margin:0' }, 'Avisar quando o descanso acabar (vibra/notifica)'),
      toggle(notifyOn, async () => {
        if (!notifyOn) {
          const perm = typeof Notification !== 'undefined' ? await Notification.requestPermission() : 'denied';
          if (perm !== 'granted') { toast('Permissão de notificação negada'); return; }
          await store.setMeta('restNotify', true);
        } else {
          await store.setMeta('restNotify', false);
        }
        setRestNotify(store.getMeta('restNotify', true));
        navigate('/settings');
      })) : null,
    el('div', { class: 'row between', style: 'margin-bottom:8px' },
      el('label', { style: 'margin:0' }, 'Manter tela acesa no treino'
        + (wakeLockSupported() ? '' : ' (não suportado)')),
      toggle(awake, async () => { await store.setMeta('keepAwake', !awake); navigate('/settings'); })),
    el('div', { class: 'row between' },
      el('label', { style: 'margin:0' }, 'Registrar RIR/RPE por série'),
      toggle(rirOn, async () => { await store.setMeta('trackRIR', !rirOn); navigate('/settings'); }))));

  // theme
  const theme = store.getMeta('theme', 'auto');
  const seg = el('div', { class: 'row', style: 'gap:6px' });
  [['auto', 'Auto'], ['light', 'Claro'], ['dark', 'Escuro']].forEach(([v, l]) => {
    seg.append(el('button', { class: 'btn-sm' + (theme === v ? ' btn-primary' : ''), style: 'flex:1',
      onclick: async () => { await store.setMeta('theme', v); applyTheme(v); navigate('/settings'); } }, l));
  });
  kids.push(card({}, el('h3', {}, 'Aparência'), seg));

  // backup
  const last = store.getMeta('lastBackupAt', null);
  const since = store.getMeta('sessionsSinceBackup', 0) || 0;
  kids.push(card({},
    el('h3', {}, 'Backup dos dados'),
    el('p', { class: 'muted', style: 'font-size:.85rem' },
      last ? `Último backup: ${fmtDate(last.slice(0, 10))} · ${since} treino(s) desde então.`
           : 'Você ainda não fez backup.'),
    el('div', { class: 'stack' },
      el('button', { class: 'btn-primary btn-block', onclick: exportData }, '⬇︎ Exportar (arquivo JSON)'),
      navigator.canShare ? el('button', { class: 'btn btn-block', onclick: shareData }, '↗ Compartilhar backup') : null,
      el('label', { class: 'btn btn-block', style: 'text-align:center;cursor:pointer' }, 'Importar backup',
        el('input', { type: 'file', accept: 'application/json,.json', style: 'display:none', onchange: importData })),
      el('details', {},
        el('summary', { class: 'muted', style: 'font-size:.85rem;cursor:pointer' }, 'Ver/copiar JSON manualmente'),
        el('textarea', { readonly: true, style: 'margin-top:8px;min-height:120px', id: 'rawjson', onclick: (e) => e.target.select() }, '')))));

  setTimeout(async () => {
    const ta = document.getElementById('rawjson');
    if (ta) ta.value = JSON.stringify(await db.exportAll());
  }, 0);

  // storage
  const stCard = card({}, el('h3', {}, 'Armazenamento'), el('p', { class: 'muted', id: 'storage-info', style: 'font-size:.85rem' }, 'Verificando…'));
  kids.push(stCard);
  setTimeout(reportStorage, 0);

  // stats + version / update
  const upStatus = el('small', { class: 'muted' });
  const upMsg = {
    checking: 'Verificando…', downloading: 'Baixando nova versão…',
    updating: 'Atualizando — a tela vai recarregar…', current: 'Você já está na versão mais recente.',
    offline: 'Sem internet agora.', 'no-sw': 'App não instalado (sem service worker).',
    unsupported: 'Não suportado neste navegador.',
  };
  kids.push(card({},
    el('h3', {}, 'Resumo'),
    el('p', { class: 'muted', style: 'font-size:.85rem' },
      `${store.state.workouts.length} treinos · ${store.state.exercises.length} exercícios · ${store.finishedSessions().length} sessões registradas`),
    el('div', { class: 'row between', style: 'margin-top:10px' },
      el('div', {}, el('div', { style: 'font-size:.85rem' }, 'Versão ', el('strong', {}, APP_VERSION)), upStatus),
      el('button', { class: 'btn-sm', onclick: async (e) => {
        e.target.disabled = true;
        await checkForUpdate((s) => { upStatus.textContent = upMsg[s] || s; });
        e.target.disabled = false;
      } }, 'Buscar atualização'))));

  // danger
  kids.push(card({},
    el('h3', { style: 'color:var(--bad)' }, 'Zona de perigo'),
    el('div', { class: 'stack' },
      el('button', { class: 'btn-danger btn-block', onclick: async () => {
        if (await confirmAction('Apagar TODAS as sessões registradas? Treinos e exercícios são mantidos.')) {
          await db.clearStore('sessions'); await store.load(); toast('Sessões apagadas'); navigate('/settings');
        }
      } }, 'Apagar histórico de sessões'),
      el('button', { class: 'btn-danger btn-block', onclick: async () => {
        if (await confirmAction('Apagar TUDO e recarregar os treinos de exemplo?')) {
          await Promise.all(['exercises', 'workouts', 'sessions', 'meta'].map(db.clearStore));
          location.reload();
        }
      } }, 'Resetar app (recarregar exemplos)'))));

  return screen({ title: 'Configurações', children: kids });
}

function profilesCard() {
  const list = profiles.listProfiles();
  const curId = profiles.currentProfileId();
  const rows = list.map((p) => el('div', { class: 'row between', style: 'padding:6px 0' },
    el('button', {
      class: 'btn-sm' + (p.id === curId ? ' btn-primary' : ''), style: 'flex:1;text-align:left',
      onclick: async () => {
        if (p.id === curId) return;
        profiles.setCurrentProfileId(p.id);
        await store.load();
        toast('Perfil: ' + p.name);
        navigate('/');
      },
    }, (p.id === curId ? '● ' : '○ ') + p.name),
    el('button', { class: 'btn-sm btn-ghost', onclick: () => {
      const name = window.prompt('Renomear perfil', p.name);
      if (name != null) { profiles.renameProfile(p.id, name); navigate('/settings'); }
    } }, 'renomear'),
    p.id !== 'default' ? el('button', { class: 'btn-sm btn-danger', onclick: async () => {
      if (await confirmAction(`Excluir o perfil "${p.name}" e TODOS os dados dele?`)) {
        await db.deleteProfileData(p.id);
        profiles.removeProfile(p.id);
        if (curId === p.id) await store.load();
        toast('Perfil excluído');
        navigate('/settings');
      }
    } }, 'excluir') : null));

  return card({},
    el('h3', {}, 'Perfis'),
    el('p', { class: 'muted', style: 'font-size:.83rem' }, 'Cada perfil tem treinos e histórico próprios neste aparelho.'),
    el('div', {}, ...rows),
    el('button', { class: 'btn-sm btn-block', style: 'margin-top:8px', onclick: () => {
      const name = window.prompt('Nome do novo perfil');
      if (!name) return;
      const id = profiles.addProfile(name);
      profiles.setCurrentProfileId(id);
      store.load().then(() => { toast('Perfil criado'); navigate('/'); });
    } }, '+ Novo perfil'));
}

async function currentBlob() {
  const data = await db.exportAll();
  return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
}
const fname = () => `treino-backup-${new Date().toISOString().slice(0, 10)}.json`;

async function exportData() {
  const blob = await currentBlob();
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: fname() });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  await store.markBackupDone();
  toast('Backup gerado');
  navigate('/settings');
}

async function shareData() {
  try {
    const blob = await currentBlob();
    const file = new File([blob], fname(), { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Backup Treino' });
      await store.markBackupDone();
      return;
    }
    toast('Compartilhamento não suportado; use Exportar.');
  } catch (e) { /* user cancelled */ }
}

async function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const replace = await confirmAction('OK = substituir todos os dados atuais.\nCancelar = mesclar com os atuais.');
    await db.importAll(data, { replace });
    await store.load();
    toast('Importado');
    navigate('/');
  } catch (err) {
    toast('Falha ao importar: ' + err.message);
  }
}

async function reportStorage() {
  const box = document.getElementById('storage-info');
  if (!box) return;
  let txt = '';
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const { usage, quota } = await navigator.storage.estimate();
      txt += `Usado: ${num((usage || 0) / 1048576)} MB de ~${num((quota || 0) / 1048576)} MB. `;
    }
    if (navigator.storage && navigator.storage.persisted) {
      const p = await navigator.storage.persisted();
      txt += p ? 'Armazenamento persistente: ativo.' : 'Persistente: não garantido.';
      if (!p) {
        box.textContent = txt;
        box.after(el('button', { class: 'btn-sm', style: 'margin-top:8px', onclick: async () => {
          const ok = await navigator.storage.persist();
          toast(ok ? 'Persistência ativada' : 'Negado pelo navegador');
          navigate('/settings');
        } }, 'Solicitar persistência'));
        return;
      }
    }
  } catch { txt = 'Não foi possível consultar o armazenamento.'; }
  box.textContent = txt || 'Sem informações de armazenamento.';
}
