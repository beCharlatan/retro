/* =========================================================
   PROJECTOR ENTRIES — "what has been entered so far", for the projector window
   =========================================================
   The facilitator types the team's answers in one person (or pair) at a time; the room
   watches them appear. A game maps its own rows to this shape and this puts it in order:

     projectorEntries({
       title: 'Ответы команды', total: 14, unit: 'человек', anonymous: false,
       rows: [{ who: ['Анна'], tag?: 'Владелец', key?: 3, complete: true,
                cells: [{ label: 'Число', value: 42 }, { label: 'Оценка', value: null }] }],
     })

   Empty cells and rows with no value yet are dropped, so a person shows up with their first
   number and fills in from there. `key` (a number) is what an anonymous list is sorted by.
   `filled` counts the rows marked complete.
========================================================= */
export function projectorEntries({ title, total, unit = 'человек', anonymous = false, rows }) {
  const has = (v) => v !== null && v !== undefined && v !== '';
  return {
    title,
    unit,
    anonymous,
    total,
    filled: rows.filter((r) => r.complete).length,
    rows: rows
      .map((r) => ({
        who: r.who ?? [],
        tag: r.tag ?? '',
        key: r.key ?? null,
        cells: r.cells
          .filter((c) => has(c.value))
          .map((c) => ({ label: c.label, value: String(c.value) })),
      }))
      .filter((r) => r.cells.length > 0),
  };
}

// 1000 → "1 000" (with a thin no-break space, so a price never wraps in the middle).
export const spaced = (n) => new Intl.NumberFormat('ru-RU').format(n).replace(/\s/g, ' ');
