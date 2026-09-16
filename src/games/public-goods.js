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
   screen switching, draft banner, ReportExport.register(..., this.renderRoot),
   data-testid test hooks). This game has no chart, so it's actually
   simpler than dictator — no imperative SVG-drawing step at all.
========================================================= */
import { html, LitElement } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { RoundFlowController } from '../controllers/round-flow-controller.js';
import { confirmExit, renderReveal } from '../game-shell.js';
import { gameAccentStyle, renderTrail } from '../game-trail.js';
import { renderHome } from '../home.js';
import { ICON_CLIPBOARD, ICON_DOWNLOAD, ICON_LEFT, ICON_RIGHT, ICON_X } from '../icons.js';
import {
  countFilled,
  hasEnough,
  hasFields,
  loadableDraft,
  parseNumberInput,
  patchRow,
} from '../logic/entries.js';
import { formatSigned } from '../logic/format.js';
import { publicGoodsResults } from '../logic/results.js';
import { Persist, timeAgo } from '../persist.js';
import { ReportExport } from '../report-export.js';
import { REVEAL_COPY } from '../reveal-copy.js';
import { avatarName, state } from '../state.js';
import { sharedStyles } from '../styles/shared-styles.js';

const STAKE = 100;
const TOTAL_SCREENS = 5;
const ROUND_TITLES = [
  'Общий котёл — дважды подряд',
  'Впишите вклад каждого участника',
  `Снова ${STAKE} фишек, тот же котёл`,
  'Что получилось у вашей команды',
  'Общественное благо',
];

export class RetroGamePublicGoods extends LitElement {
  static styles = sharedStyles;

  static properties = {
    data: { state: true },
    draft: { state: true },
    results: { state: true },
  };

  constructor() {
    super();
    this.names = state.participants.slice();
    this.flow = new RoundFlowController(this, { titles: ROUND_TITLES });
    this.data = this._blankData();
    this.results = null;

    this.draft = loadableDraft(Persist.load('public-goods'), {
      key: 'data',
      length: this.names.length,
    });
  }

  _blankData() {
    return this.names.map((n) => ({ name: n, r1: null, r2: null }));
  }

  _restoreDraft() {
    this.flow.advance(1, () => {
      this.data = this.draft.payload.data;
      this.draft = null;
    });
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
    this.data = patchRow(this.data, idx, {
      [field]: parseNumberInput(e.target.value, { min: 0, max: STAKE }),
    });
    Persist.save('public-goods', { data: this.data });
  }

  _filledCount(field) {
    return countFilled(this.data, hasFields(field));
  }

  _showResults() {
    this.results = publicGoodsResults(this.data, STAKE);
    const { filled } = this.results;

    ReportExport.register(
      'public-goods',
      {
        subtitle:
          'Группе выгодно вкладываться всем — каждому по отдельности выгоднее не вкладываться.',
        meta: ReportExport.meta(filled.length, '2 раунда'),
        explanation:
          'Группе выгодно, если вкладываются все, но каждому по отдельности выгоднее не вкладываться, а пользоваться чужим вкладом — классическая «проблема безбилетника». Один из первых систематических экспериментов — Marwell G., Ames R. (1979); устойчивый результат в литературе — вклады обычно снижаются при повторении игры с одной и той же группой.',
      },
      this.renderRoot,
    );
  }

  async _reset() {
    this.data = this._blankData();
    this.results = null;
    Persist.clear('public-goods');
    this.flow.reset();
    await this.updateComplete;
    this.flow.scrollTo(0);
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
      <div class="wrap-wide" style=${gameAccentStyle('public-goods')}>
        <button type="button" class="game-exit" aria-label="Выйти из игры" @click=${() => confirmExit(() => this._goHome())}>
          ${unsafeHTML(ICON_X)}
        </button>

        <div class="game-shell">
          <div class="game-main">
        <section class="${this.flow.roundClass(0)}" id="round-0">
          <div class="round-body">
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
                      >${unsafeHTML(ICON_CLIPBOARD)} Есть незавершённая попытка (${timeAgo(this.draft.savedAt)}) — продолжить
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
            <button class="primary" @click=${() => this.flow.advance(1)}>Раунд 1 ${unsafeHTML(ICON_RIGHT)}</button>
          </div>
          </div>
          ${this.flow.lock(0)}
        </section>

        <section class="${this.flow.roundClass(1)}" id="round-1">
          <div class="round-body">
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
            <button class="ghost" @click=${() => this.flow.scrollTo(0)}>${unsafeHTML(ICON_LEFT)} Назад</button>
            <button
              class="primary"
              data-testid="next-btn-1"
              ?disabled=${!hasEnough(filled1)}
              @click=${() => this.flow.advance(2)}
            >
              Раунд 2 ${unsafeHTML(ICON_RIGHT)}
            </button>
          </div>
          </div>
          ${this.flow.lock(1)}
        </section>

        <section class="${this.flow.roundClass(2)}" id="round-2">
          <div class="round-body">
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
            <button class="ghost" @click=${() => this.flow.scrollTo(1)}>${unsafeHTML(ICON_LEFT)} Назад</button>
            <button
              class="primary"
              data-testid="next-btn-2"
              ?disabled=${!hasEnough(filled2)}
              @click=${() => this.flow.advance(3, () => this._showResults())}
            >
              Показать результаты ${unsafeHTML(ICON_RIGHT)}
            </button>
          </div>
          </div>
          ${this.flow.lock(2)}
        </section>

        <section class="${this.flow.roundClass(3)}" id="round-3">
          <div class="round-body">
          <p class="eyebrow">Результаты</p>
          <h2>Что получилось у вашей команды</h2>

          ${renderReveal({ value: r ? (r.delta >= 0 ? '+' : '') + r.delta.toFixed(1) : '—', ...REVEAL_COPY.publicGoods(r ? { avgR1: r.s1.avg, avgR2: r.s2.avg, delta: r.delta, stake: STAKE } : null) })}

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

          <table class="results-table" id="results-table">
            <thead>
              <tr>
                <th>Участник</th>
                <th>Раунд 1</th>
                <th>Раунд 2</th>
                <th>Изменение</th>
              </tr>
            </thead>
            <tbody id="results-tbody">
              ${
                r
                  ? r.filled.map((d) => {
                      return html`
                      <tr>
                        <td class="name">${unsafeHTML(avatarName(d.name))}</td>
                        <td>${d.r1}</td>
                        <td>${d.r2}</td>
                        <td>${formatSigned(d.r2 - d.r1)}</td>
                      </tr>
                    `;
                    })
                  : ''
              }
            </tbody>
          </table>

          <div class="export-row">
            <button class="ghost" id="export-btn" @click=${(e) => ReportExport.download(e.currentTarget)}>
              ${unsafeHTML(ICON_DOWNLOAD)} Сохранить результаты
            </button>
          </div>

          <div class="nav-row">
            <button class="ghost" @click=${() => this.flow.scrollTo(2)}>${unsafeHTML(ICON_LEFT)} Назад</button>
            <button class="primary" @click=${() => this.flow.advance(4)}>Что это было? ${unsafeHTML(ICON_RIGHT)}</button>
          </div>
          </div>
          ${this.flow.lock(3)}
        </section>

        <section class="${this.flow.roundClass(4)}" id="round-4">
          <div class="round-body">
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
          </div>
          ${this.flow.lock(4)}
        </section>
          </div>

          <aside class="game-rail">
            <div class="game-rail-title">Общественное благо</div>
            ${renderTrail({
              current: this.flow.activeRound,
              total: TOTAL_SCREENS,
              gameId: 'public-goods',
              stepLabels: ROUND_TITLES,
            })}
          </aside>
        </div>
      </div>
    `;
  }
}

customElements.define('retro-game-public-goods', RetroGamePublicGoods);
