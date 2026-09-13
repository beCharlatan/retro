/* =========================================================
   GAME: Эффект Барнума / Форера (barnum)

   Lit/Shadow DOM component (docs/modernization-plan.md Phase 3) —
   same pattern as the earlier solo games, plus the first game with a
   copy-to-clipboard button (copyToClipboard() from ../toast.js
   operates on the passed button element directly, so it needs no
   shadow-root-awareness of its own). Keeps its original plain id
   (#copy-profile), same reasoning as crowd-wisdom's header comment.
========================================================= */
import { html, LitElement } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { renderHome } from '../home.js';
import { ICON_CLIPBOARD, ICON_LEFT, ICON_PRINT, ICON_RIGHT } from '../icons.js';
import { Persist, timeAgo } from '../persist.js';
import { Print } from '../print.js';
import { avatarName, state } from '../state.js';
import { sharedStyles } from '../styles/shared-styles.js';
import { copyToClipboard } from '../toast.js';

const PROFILE_TEXT =
  'Иногда вы сомневаетесь, правильно ли поступили или приняли верное решение. Вы цените, когда вас окружают доказательства того, что вас любят и уважают, но при этом умеете быть требовательны к себе. У вас есть значительный неиспользуемый потенциал, который вы не всегда обращаете себе на пользу. Внешне вы дисциплинированы и держите себя в руках, но внутри нередко испытываете тревогу и неуверенность. Порой вы всерьёз сомневаетесь, правильный ли выбор сделали в жизни или в карьере. Вам нравится определённая доля перемен и разнообразия, а жёсткие рамки и ограничения вызывают недовольство.';
const TOTAL_SCREENS = 4;

export class RetroGameBarnum extends LitElement {
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

    const loaded = Persist.load('barnum');
    this.draft =
      loaded &&
      Array.isArray(loaded.payload.data) &&
      loaded.payload.data.length === this.names.length
        ? loaded
        : null;
  }

  _blankData() {
    return this.names.map((n) => ({ name: n, rating: null }));
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
    Persist.clear('barnum');
    this.draft = null;
  }

  _goHome() {
    Persist.clear('barnum');
    renderHome();
  }

  _copyProfile(e) {
    copyToClipboard(PROFILE_TEXT, e.currentTarget);
  }

  _onEntryInput(e, idx) {
    let v = e.target.value === '' ? null : Number(e.target.value);
    if (v !== null) {
      if (v < 0) v = 0;
      if (v > 5) v = 5;
    }
    this.data = this.data.map((row, i) => (i === idx ? { ...row, rating: v } : row));
    Persist.save('barnum', { data: this.data });
  }

  _filledCount() {
    return this.data.filter((d) => d.rating !== null).length;
  }

  _showResults() {
    const filled = this.data.filter((d) => d.rating !== null);
    const avg = filled.reduce((a, b) => a + b.rating, 0) / filled.length;
    this.results = { filled, avg };

    Print.mount(
      'print-header-barnum',
      {
        title: 'Эффект Барнума',
        subtitle: 'Расплывчатое описание личности кажется удивительно «прямо про меня».',
        meta: Print.meta(filled.length),
        explanation:
          'Расплывчатое, общее для всех описание личности воспринимается как удивительно точное и «прямо про меня» — потому что читающий сам додумывает подходящие примеры из своей жизни. Эффект впервые продемонстрировал психолог Бертрам Форер в 1949 году: все 39 студентов получили один и тот же текст и в среднем оценили его точность на 4.26 из 5.',
      },
      this.renderRoot,
    );

    this.goTo(2);
  }

  _reset() {
    this.data = this._blankData();
    this.results = null;
    Persist.clear('barnum');
    this.goTo(0);
  }

  _entryRow(row, idx) {
    return html`
      <div class="entry-row two-col">
        <div class="name">${unsafeHTML(avatarName(row.name))}</div>
        <input
          type="number"
          min="0"
          max="5"
          step="1"
          inputmode="numeric"
          placeholder="0–5"
          .value=${row.rating ?? ''}
          @input=${(e) => this._onEntryInput(e, idx)}
        />
      </div>
    `;
  }

  render() {
    const filled = this._filledCount();
    const r = this.results;

    return html`
      <div class="wrap narrow">
        <div class="game-crumb">
          <button class="back-link" @click=${this._goHome}>${unsafeHTML(ICON_LEFT)} Все игры</button>
          <span class="crumb-sep">/</span>
          <span class="crumb-current">Эффект Барнума</span>
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
          <p class="eyebrow">Командное упражнение · 6 минут</p>
          <h1>Персональный психологический портрет команды</h1>
          <p class="lede">
            Перед игрой команда заполнила короткий опросник о себе (реально не нужно ничего
            заполнять — просто скажите это вслух для атмосферы). Ниже — их индивидуальный разбор.
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
                <b>Прочитайте вслух текст на следующем экране</b>
                <span>Как «результат психологического анализа», подготовленный лично для команды.</span>
              </div>
            </li>
            <li>
              <div class="step-num">2</div>
              <div class="step-body">
                <b>Каждый оценивает точность про себя</b>
                <span
                  >От 0 (совсем не про меня) до 5 (прямо в точку) — насколько описание похоже
                  лично на вас.</span
                >
              </div>
            </li>
          </ol>

          <p class="note">Не подглядывайте вперёд — оценивайте по первому впечатлению.</p>

          <div class="quote-card">
            <div class="spoiler-head">
              <b>Текст для команды</b>
              <div class="spoiler-actions">
                <!-- Plain emoji here on purpose, not the kit's clipboard
                     icon: copyToClipboard() (toast.js) overwrites this
                     button's textContent imperatively for the "✓
                     Скопировано" feedback, which would eject the icon's
                     Lit-managed ChildPart marker nodes and throw on the
                     next render ("ChildPart has no parentNode"). -->
                <button type="button" class="ghost" id="copy-profile" @click=${(e) => this._copyProfile(e)}>
                  📋 Скопировать
                </button>
              </div>
            </div>
            <p>«${PROFILE_TEXT}»</p>
          </div>

          <div class="nav-row">
            <span></span>
            <button class="primary" @click=${() => this.goTo(1)}>Вносить данные ${unsafeHTML(ICON_RIGHT)}</button>
          </div>
        </section>

        <section class="screen ${this.screenIdx === 1 ? 'active' : ''}">
          <p class="eyebrow">Сбор данных</p>
          <h2>Впишите оценку каждого участника</h2>
          <p class="lede">От 0 (совсем не про меня) до 5 (прямо в точку).</p>

          <div class="entry-head two-col">
            <div>Участник</div>
            <div>Оценка (0–5)</div>
          </div>
          <div id="entry-body">${this.data.map((row, i) => this._entryRow(row, i))}</div>

          <div class="fill-progress">
            Заполнено: <span>${filled}</span> из <span>${this.names.length}</span>
            <div class="track">
              <div style="width:${(filled / this.names.length) * 100}%"></div>
            </div>
          </div>

          <div class="nav-row">
            <button class="ghost" @click=${() => this.goTo(0)}>${unsafeHTML(ICON_LEFT)} Назад</button>
            <button class="primary" ?disabled=${filled < 2} @click=${() => this._showResults()}>
              Показать результаты ${unsafeHTML(ICON_RIGHT)}
            </button>
          </div>
        </section>

        <section class="screen ${this.screenIdx === 2 ? 'active' : ''}">
          <p class="eyebrow">Результаты</p>
          <h2>Что получилось у вашей команды</h2>
          <div class="print-header" id="print-header-barnum"></div>

          <div class="reveal">
            <div class="n">${r ? r.avg.toFixed(2) + ' / 5' : '—'}</div>
            <p>
              <b>Средняя оценка точности</b> из 5 — команда в среднем сочла описание довольно
              похожим на себя.
            </p>
          </div>

          <div class="quote-card">
            <p>«${PROFILE_TEXT}»</p>
          </div>
          <p>
            <b>Сюрприз:</b> это тот же самый текст, что был на первом экране — и каждый участник
            получил ровно его, слово в слово. Никакого «индивидуального анализа» не было.
          </p>

          <table class="results-table" id="results-table">
            <thead>
              <tr>
                <th>Участник</th>
                <th>Оценка</th>
              </tr>
            </thead>
            <tbody id="results-tbody">
              ${
                r
                  ? r.filled.map(
                      (d) => html`
                      <tr>
                        <td class="name">${unsafeHTML(avatarName(d.name))}</td>
                        <td>${d.rating} / 5</td>
                      </tr>
                    `,
                    )
                  : ''
              }
            </tbody>
          </table>

          <div class="print-footer" id="print-footer-barnum"></div>

          <div class="pdf-row">
            <button class="ghost" id="pdf-btn" @click=${() => Print.run()}>
              ${unsafeHTML(ICON_PRINT)} Сохранить / отправить PDF
            </button>
          </div>

          <div class="nav-row">
            <button class="ghost" @click=${() => this.goTo(1)}>${unsafeHTML(ICON_LEFT)} Назад</button>
            <button class="primary" @click=${() => this.goTo(3)}>Что это было? ${unsafeHTML(ICON_RIGHT)}</button>
          </div>
        </section>

        <section class="screen ${this.screenIdx === 3 ? 'active' : ''}">
          <p class="eyebrow">А теперь — контекст</p>
          <h1>Эффект Барнума / Форера</h1>
          <p class="lede">
            Расплывчатое, «универсальное» описание личности воспринимается как удивительно точное
            — если человек верит, что оно составлено именно для него.
          </p>

          <p>
            В 1949 году психолог Бертрам Форер дал 39 студентам тест личности, а через неделю
            раздал каждому «индивидуальный» разбор — якобы составленный по результатам их теста.
            На деле все получили один и тот же текст, собранный из газетного гороскопа, а сам тест
            никак не обрабатывался.
          </p>

          <div class="stat-row">
            <div class="stat">
              <div class="n">4.26 / 5</div>
              <div class="lab">средняя оценка точности в оригинальном опыте Форера</div>
            </div>
            <div class="stat">
              <div class="n">39</div>
              <div class="lab">студентов получили один и тот же текст</div>
            </div>
          </div>

          <p>
            Опубликовано как Forer B. R. (1949). The Fallacy of Personal Validation: A Classroom
            Demonstration of Gullibility. <i>Journal of Abnormal and Social Psychology</i>, 44(1),
            118–123. Термин «эффект Барнума» ввёл психолог Пол Мил в 1956 году — в честь шоумена
            Ф. Т. Барнума, чей девиз был «у нас для каждого найдётся что-нибудь».
          </p>

          <p>
            <b>Почему расплывчатость работает лучше точности.</b> Фразы вроде «иногда вы
            сомневаетесь в своих решениях» технически верны для почти любого живого человека — но
            воспринимаются они не как общие, а как личные, потому что читающий сам додумывает
            конкретный случай из своей жизни, который под них подходит. Мозг охотно ищет
            подтверждения («да, точно, было на прошлой неделе!») и почти не ищет опровержений —
            это отдельное, тоже хорошо изученное искажение, склонность к подтверждению
            (confirmation bias). Плюс формулировки часто строятся как «двусторонние»: «вы бываете
            общительны, но иногда любите одиночество» — подходит буквально всем, потому что
            покрывает оба варианта сразу.
          </p>

          <hr />
          <h2>Ещё немного фактов</h2>

          <div class="fact">
            <b>Этим держатся гороскопы и многие онлайн-тесты личности</b
            ><span
              >Формулировки специально делают расплывчатыми и «двусторонними»
              («дисциплинированы снаружи, но тревожны внутри») — какой бы стороной вы ни были,
              фраза всё равно попадёт.</span
            >
          </div>
          <div class="fact">
            <b>Позитивная формулировка усиливает эффект</b
            ><span
              >Люди охотнее соглашаются с лестными расплывчатыми описаниями, чем с нейтральными
              или негативными — общая благосклонность к себе подыгрывает искажению.</span
            >
          </div>
          <div class="fact">
            <b>Авторитет источника тоже усиливает эффект</b
            ><span
              >Тот же самый текст, поданный как «результат теста от психолога», воспринимается
              точнее, чем поданный как шутка или случайный текст — доверие к источнику подкрепляет
              доверие к содержанию.</span
            >
          </div>
          <div class="fact">
            <b>Работает даже на профессионалов</b
            ><span
              >В повторных опытах студенты психологических факультетов, знавшие об эффекте
              Барнума и специально предупреждённые, всё равно оценивали общий текст как «довольно
              точный» — интеллектуальное знание о ловушке не отменяет автоматической реакции.</span
            >
          </div>
          <div class="fact">
            <b>Основа целой индустрии «холодного чтения»</b
            ><span
              >Экстрасенсы и гадалки используют тот же приём вживую: начинают с общих
              утверждений, наблюдают за реакцией собеседника и постепенно уточняют формулировки в
              сторону того, что вызывает у него отклик — сам «дар предвидения» тут не нужен.</span
            >
          </div>
          <div class="fact">
            <b>Обратная сторона — эффект хорошо продаваемой обратной связи</b
            ><span
              >Расплывчатые комментарии о работе сотрудника («у вас большой потенциал, которым вы
              не всегда пользуетесь») звучат вдумчиво, но малополезны на практике именно потому,
              что подходят почти любому человеку — конкретная обратная связь работает лучше именно
              из-за своей конкретности.</span
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

customElements.define('retro-game-barnum', RetroGameBarnum);
