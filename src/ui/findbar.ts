import type { App } from '../app';
import { h, iconEl } from './dom';

export function initFindBar(app: App) {
  const bar = app.findBar;
  const find = h('input', { attrs: { type: 'text', placeholder: 'Find', 'aria-label': 'Find' } });
  const repl = h('input', { attrs: { type: 'text', placeholder: 'Replace with', 'aria-label': 'Replace with' } });
  const count = h('span', { class: 'count', text: '' });
  const matchCase = h('input', { attrs: { type: 'checkbox' } });
  const replRow = h('div', { class: 'row', style: { display: 'none' } }, repl,
    h('button', { class: 'btn', style: { height: '28px', padding: '0 10px' }, text: 'Replace', on: { click: () => doReplace() } }),
    h('button', { class: 'btn', style: { height: '28px', padding: '0 10px' }, text: 'All', title: 'Replace all', on: { click: () => app.editor.commands.replaceAll(repl.value) } }),
  );
  const ed = () => app.editor;

  const doReplace = () => {
    ed().commands.replaceCurrent(repl.value);
    ed().commands.findNext();
  };
  const update = () => {
    const s = ed().storage.find;
    if (!find.value) count.textContent = '';
    else count.textContent = s.count ? `${s.current + 1} of ${s.count}` : 'No results';
  };
  const query = () => {
    ed().commands.setFindQuery(find.value, matchCase.checked);
    update();
  };
  const close = () => {
    bar.classList.remove('open');
    ed().commands.clearFind();
    ed().commands.focus();
  };

  find.addEventListener('input', query);
  matchCase.addEventListener('change', query);
  find.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) ed().commands.findPrevious();
      else ed().commands.findNext();
    } else if (e.key === 'Escape') close();
  });
  repl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      doReplace();
    } else if (e.key === 'Escape') close();
  });

  bar.append(
    h('div', { class: 'row' }, find, count,
      h('button', { class: 'icon-btn', title: 'Previous (Shift+Enter)', on: { click: () => ed().commands.findPrevious() } }, iconEl('up', 16)),
      h('button', { class: 'icon-btn', title: 'Next (Enter)', on: { click: () => ed().commands.findNext() } }, iconEl('chevron', 16)),
      h('button', { class: 'icon-btn', title: 'Close', on: { click: close } }, iconEl('close', 16)),
    ),
    replRow,
    h('div', { class: 'row' }, h('label', null, matchCase, 'Match case')),
  );

  return {
    open(replaceMode: boolean) {
      bar.classList.add('open');
      replRow.style.display = replaceMode ? 'flex' : 'none';
      const { from, to, empty } = ed().state.selection;
      if (!empty && to - from < 100) find.value = ed().state.doc.textBetween(from, to, ' ');
      query();
      find.focus();
      find.select();
      ed().on('transaction', update);
    },
  };
}
