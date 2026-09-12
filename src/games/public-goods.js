/* =========================================================
   GAME: Общественное благо (public-goods)
   Two rounds instead of one: same pool, same rules, fresh
   100 фишек each time. Classic finding in the literature is
   that contributions decline when the exact same group plays
   more than once — round 2 lets the team test that directly
   on themselves instead of just reading about it in the facts.

   Lit/Shadow DOM component (docs/modernization-plan.md Phase 3) —
   same pattern as the src/games/dictator.js pilot (Phase 2): see that
   file's header comment for the architecture notes (declarative
   screen switching, draft banner, Print.mount(..., this.renderRoot),
   data-testid test hooks). This game has no chart, so it's actually
   simpler than dictator — no imperative SVG-drawing step at all.
========================================================= */
import { html, LitElement } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { renderHome } from '../home.js';
import { Persist, timeAgo } from '../persist.js';
import { Print } from '../print.js';
import { avatarName, state } from '../state.js';
import { sharedStyles } from '../styles/shared-styles.js';

const STAKE = 100;
const TOTAL_SCREENS = 5;

function roundStats(filled, field) {
  const n = filled.length;
  const sumContrib = filled.reduce((a, b) => a + b[field], 0);
  const pot = sumContrib * 2;
  const totalPayoff = Math.round(n * STAKE - sumContrib + pot);
  const avg = sumContrib / n;
  return { avg, totalPayoff };
}

export class RetroGamePublicGoods extends LitElement {
  static styles = sharedStyles;

  static properties = {
    screenIdx: { state: true },
    data: { state: true },
    draft: { state: true },
    results: { state: true },
  };

  constructor() {
    super();
    this.names = state.participants.slice();
    this.screenIdx = 0;
    this.data = this._blankData();
    this.results = null;

    const loaded = Persist.load('public-goods');
    this.draft =
      loaded &&
      Array.isArray(loaded.payload.data) &&
      loaded.payload.data.length === this.names.length
        ? loaded
        : null;
  }

  _blankData() {
    return this.names.map((n) => ({ name: n, r1: null, r2: null }));
  }

  goTo(idx) {
    this.screenIdx = idx;
  }

  _restoreDraft() {
    this.data = this.draft.payload.data;
    this.draft = null;
    this.goTo(1);
  }

  _discardDraft() {
    Persist.clear('public-goods');
    this.draft = null;
  }

  _goHome() {
    Persist.clear('public-goods');
    renderHome();
  }

  _onEntryInput(e, idx, field) {
    let v = e.target.value === '' ? null : Number(e.target.value);
    if (v !== null) {
      if (v < 0) v = 0;
      if (v > STAKE) v = STAKE;
    }
    this.data = this.data.map((row, i) => (i === idx ? { ...row, [field]: v } : row));
    Persist.save('public-goods', { data: this.data });
  }

  _filledCount(field) {
    return this.data.filter((d) => d[field] !== null).length;
  }

  _showResults() {
    const filled = this.data.filter((d) => d.r1 !== null && d.r2 !== null);
    const s1 = roundStats(filled, 'r1');
    const s2 = roundStats(filled, 'r2');
    this.results = { filled, s1, s2, delta: s2.avg - s1.avg };

    Print.mount(
      'print-header-public-goods',
      {
        title: 'Общественное благо',
        subtitle:
          'Группе выгодно вкладываться всем — каждому по отдельности выгоднее не вкладываться.',
        meta: Print.meta(filled.length, '2 раунда'),
        explanation:
          'Группе выгодно, если вкладываются все, но каждому по отдельности выгоднее не вкладываться, а пользоваться чужим вкладом — классическая «проблема безбилетника». Один из первых систематических экспериментов — Marwell G., Ames R. (1979); устойчивый результат в литературе — вклады обычно снижаются при повторении игры с одной и той же группой.',
      },
      this.renderRoot,
    );

    this.goTo(3);
  }

  _reset() {
    this.data = this._blankData();
    this.results = null;
    Persist.clear('public-goods');
    this.goTo(0);
  }

  _entryRow(row, idx, field) {
    return html`
      <div class="entry-row two-col">
        <div class="name">${unsafeHTML(avatarName(row.name))}</div>
        <input
          type="number"
          min="0"
          max="${STAKE}"
          inputmode="numeric"
          placeholder="0–${STAKE}"
          .value=${row[field] ?? ''}
          @input=${(e) => this._onEntryInput(e, idx, field)}
        />
      </div>
    `;
  }

  render() {
    const filled1 = this._filledCount('r1');
    const filled2 = this._filledCount('r2');
    const r = this.results;

    return html`
      <div class="wrap narrow">
        <div class="game-crumb">
          <button class="back-link" @click=${this._goHome}>← Все игры</button>
          <span class="crumb-sep">/</span>
          <span class="crumb-current">Общественное благо</span>
        </div>
        <div class="progress">
          ${Array.from(
            { length: TOTAL_SCREENS },
            (_, i) => html`
              <div
                class="dot ${i === this.screenIdx ? 'active' : ''} ${i < this.screenIdx ? 'done' : ''}"
              ></div>
            `,
          )}
        </div>

        <section class="screen ${this.screenIdx === 0 ? 'active' : ''}">
          <p class="eyebrow">Командное упражнение · 10 минут</p>
          <h1>Общий котёл — дважды подряд</h1>
          <p class="lede">
            Два раунда с одной и той же группой. Правила не меняются — интересно как раз то,
            изменится ли поведение.
          </p>

          <div class="draft-mount">
            ${
              this.draft
                ? html`
                  <div class="draft-banner">
                    <span class="draft-text"
                      >📋 Есть незавершённая попытка (${timeAgo(this.draft.savedAt)}) — продолжить
                      с того места?</span
                    >
                    <span class="draft-actions">
                      <button type="button" class="draft-restore" @click=${() => this._restoreDraft()}>
                        Восстановить
                      </button>
                      <button type="button" class="draft-discard" @click=${() => this._discardDraft()}>
                        Начать заново
                      </button>
                    </span>
                  </div>
                `
                : ''
            }
          </div>

          <ol class="step-list">
            <li>
              <div class="step-num">1</div>
              <div class="step-body">
                <b>Прочитайте вслух правила</b>
                <span
                  >«У каждого есть ${STAKE} фишек. Можно вложить любую часть в общий котёл —
                  остальное останется себе. Сумма всех вкладов удвоится и разделится поровну между
                  ВСЕМИ участниками, независимо от того, кто сколько вложил».</span
                >
              </div>
            </li>
            <li>
              <div class="step-num">2</div>
              <div class="step-body">
                <b>Сыграйте два раунда подряд</b>
                <span
                  >В каждом раунде — заново ${STAKE} фишек и тот же общий котёл с теми же людьми.
                  Решайте оба раза независимо, не оглядываясь на то, что писали в первый раз.</span
                >
              </div>
            </li>
          </ol>

          <p class="note">
            Решение анонимное и ни на что не влияет по-настоящему — но отвечайте так, будто фишки
            настоящие.
          </p>

          <div class="nav-row">
            <span></span>
            <button class="primary" @click=${() => this.goTo(1)}>Раунд 1 →</button>
          </div>
        </section>

        <section class="screen ${this.screenIdx === 1 ? 'active' : ''}">
          <p class="eyebrow">Раунд 1 из 2</p>
          <h2>Впишите вклад каждого участника</h2>
          <p class="lede">Сколько из ${STAKE} фишек каждый вложил в общий котёл.</p>

          <div class="entry-head two-col">
            <div>Участник</div>
            <div>Вклад (0–${STAKE})</div>
          </div>
          <div data-testid="entry-body-1">
            ${this.data.map((row, i) => this._entryRow(row, i, 'r1'))}
          </div>

          <div class="fill-progress">
            Заполнено: <span>${filled1}</span> из <span>${this.names.length}</span>
            <div class="track">
              <div style="width:${(filled1 / this.names.length) * 100}%"></div>
            </div>
          </div>

          <div class="nav-row">
            <button class="ghost" @click=${() => this.goTo(0)}>← Назад</button>
            <button
              class="primary"
              data-testid="next-btn-1"
              ?disabled=${filled1 < 2}
              @click=${() => this.goTo(2)}
            >
              Раунд 2 →
            </button>
          </div>
        </section>

        <section class="screen ${this.screenIdx === 2 ? 'active' : ''}">
          <p class="eyebrow">Раунд 2 из 2</p>
          <h2>Снова ${STAKE} фишек, тот же котёл</h2>
          <p class="lede">Те же правила, новая попытка — с теми же людьми.</p>

          <div class="entry-head two-col">
            <div>Участник</div>
            <div>Вклад (0–${STAKE})</div>
          </div>
          <div data-testid="entry-body-2">
            ${this.data.map((row, i) => this._entryRow(row, i, 'r2'))}
          </div>

          <div class="fill-progress">
            Заполнено: <span>${filled2}</span> из <span>${this.names.length}</span>
            <div class="track">
              <div style="width:${(filled2 / this.names.length) * 100}%"></div>
            </div>
          </div>

          <div class="nav-row">
            <button class="ghost" @click=${() => this.goTo(1)}>← Назад</button>
            <button
              class="primary"
              data-testid="next-btn-2"
              ?disabled=${filled2 < 2}
              @click=${() => this._showResults()}
            >
              Показать результаты →
            </button>
          </div>
        </section>

        <section class="screen ${this.screenIdx === 3 ? 'active' : ''}">
          <p class="eyebrow">Результаты</p>
          <h2>Что получилось у вашей команды</h2>
          <div class="print-header" id="print-header-public-goods"></div>

          <div class="reveal">
            <div class="n">${r ? (r.delta >= 0 ? '+' : '') + r.delta.toFixed(1) : '—'}</div>
            <p>
              <b>Насколько изменился средний вклад</b> между раундами — раунд 2 минус раунд 1, в
              фишках.
            </p>
          </div>

          <div class="group-compare">
            <div class="g low">
              <div class="t">Раунд 1 · средний вклад</div>
              <div class="v">${r ? r.s1.avg.toFixed(1) : '—'}</div>
            </div>
            <div class="g high">
              <div class="t">Раунд 2 · средний вклад</div>
              <div class="v">${r ? r.s2.avg.toFixed(1) : '—'}</div>
            </div>
          </div>

          <div class="stat-row">
            <div class="stat">
              <div class="n">${r ? r.s1.totalPayoff : '—'}</div>
              <div class="lab">общая выгода группы, раунд 1</div>
            </div>
            <div class="stat">
              <div class="n">${r ? r.s2.totalPayoff : '—'}</div>
              <div class="lab">общая выгода группы, раунд 2</div>
            </div>
          </div>

          <table class="results-table">
            <thead>
              <tr>
                <th>Участник</th>
                <th>Раунд 1</th>
                <th>Раунд 2</th>
                <th>Изменение</th>
              </tr>
            </thead>
            <tbody>
              ${
                r
                  ? r.filled.map((d) => {
                      const diff = d.r2 - d.r1;
                      const diffText = (diff >= 0 ? '+' : '') + diff;
                      return html`
                      <tr>
                        <td class="name">${unsafeHTML(avatarName(d.name))}</td>
                        <td>${d.r1}</td>
                        <td>${d.r2}</td>
                        <td>${diffText}</td>
                      </tr>
                    `;
                    })
                  : ''
              }
            </tbody>
          </table>

          <div class="print-footer" id="print-footer-public-goods"></div>

          <div class="pdf-row">
            <button class="ghost" id="pdf-btn" @click=${() => Print.run()}>
              🖨️ Сохранить / отправить PDF
            </button>
          </div>

          <div class="nav-row">
            <button class="ghost" @click=${() => this.goTo(2)}>← Назад</button>
            <button class="primary" @click=${() => this.goTo(4)}>Что это было? →</button>
          </div>
        </section>

        <section class="screen ${this.screenIdx === 4 ? 'active' : ''}">
          <p class="eyebrow">А теперь — контекст</p>
          <h1>Общественное благо</h1>
          <p class="lede">
            Группе выгоднее, если все вкладываются в общий котёл — но каждому по отдельности
            выгоднее не вкладываться, а пользоваться вкладом остальных.
          </p>

          <p>
            Это классическая иллюстрация «проблемы безбилетника» (free-rider problem). Ваш
            собственный вклад приносит вам обратно лишь часть от удвоенной доли — то есть
            вкладывать невыгодно лично вам, даже если это выгодно группе в целом. Рациональная с
            точки зрения группы стратегия («вложить всё») и рациональная с точки зрения отдельного
            игрока стратегия («вложить 0») прямо противоречат друг другу.
          </p>

          <p>
            Один из первых систематических экспериментов — Marwell G., Ames R. E. (1979).
            Experiments on the Provision of Public Goods. <i>American Journal of Sociology</i>. В
            статье было ироничное подназвание «...does anyone else?» — единственной группой в их
            выборке, которая вела себя близко к модели «рационального эгоиста», оказались
            студенты экономических факультетов.
          </p>

          <p>
            <b>Почему математика тянет в разные стороны.</b> Каждый рубль, который вы оставляете
            себе, достаётся вам полностью. Каждый рубль, который вы вкладываете в котёл,
            удваивается — но делится на всех поровну, а значит, лично вам от него возвращается
            меньше рубля (если участников больше двух). Получается, что с точки зрения личной
            выгоды вкладывать невыгодно <i>вообще всегда</i>, независимо от того, что делают
            остальные. Но если разные люди задумываются об этом одинаково и все выбирают «не
            вкладывать», проигрывают все сразу — общий пирог получается меньше, чем мог бы быть.
          </p>

          <p>
            <b>Зачем нужен именно второй раунд.</b> В однораундовой версии легко списать щедрость
            на растерянность или желание «сыграть по-честному с первого раза». Второй раунд с теми
            же людьми убирает эту неопределённость: теперь у каждого уже есть опыт первого раунда
            за плечами. Если вклад упал — это, скорее всего, разочарование или недоверие к чужой
            щедрости. Если вклад вырос или остался прежним — это уже не случайность, а устойчивая
            склонность к сотрудничеству именно в этой группе.
          </p>

          <hr />
          <h2>Ещё немного фактов</h2>

          <div class="fact">
            <b>При повторении игры вклады обычно падают</b
            ><span
              >Это именно то, что вы, возможно, только что проверили на своей команде: если
              сыграть несколько раундов подряд с одной и той же группой, средний вклад со временем
              снижается — даже у тех, кто начинал щедро, доверие постепенно иссякает.</span
            >
          </div>
          <div class="fact">
            <b>Спор «яйца или курица» с экономическим образованием</b
            ><span
              >Устойчивый результат в литературе: студенты-экономисты вкладывают в общий котёл
              заметно меньше, чем студенты других специальностей. Открытый вопрос — учат ли на
              экономфаке эгоизму, или эгоистичные люди чаще выбирают экономику.</span
            >
          </div>
          <div class="fact">
            <b>Наказание возвращает кооперацию</b
            ><span
              >Fehr и Gächter (2002) показали: если участникам дать возможность платить небольшую
              сумму, чтобы штрафовать тех, кто вкладывает мало, средний вклад в группе резко и
              устойчиво растёт — люди готовы наказывать «безбилетников» даже себе в убыток.</span
            >
          </div>
          <div class="fact">
            <b>Это модель климата и рыболовства в миниатюре</b
            ><span
              >Экономисты используют ровно эту логику для описания «трагедии общин» — от
              чрезмерного вылова рыбы в общих водах до выбросов CO₂: индивидуально выгодно
              продолжать как прежде, а коллективно это разрушает ресурс для всех.</span
            >
          </div>
          <div class="fact">
            <b>Прямая рабочая параллель</b
            ><span
              >Документация, код-ревью, помощь новичкам — тоже «общий котёл»: каждому по
              отдельности выгоднее переложить это на других, но если так решат все — хуже будет
              всей команде.</span
            >
          </div>

          <div class="nav-row">
            <button class="ghost" @click=${() => this._reset()}>↺ Начать заново</button>
            <span></span>
          </div>
        </section>
      </div>
    `;
  }
}

customElements.define('retro-game-public-goods', RetroGamePublicGoods);
