// Sort tables with the class "sortable" when a visitor clicks a column header.
// A cell can give its sort value in data-sort; empty values always go last.
function value(row, column) {
  const cell = row.cells[column];
  return cell.dataset.sort ?? cell.textContent.trim();
}

function compare(a, b) {
  if (a === "" || b === "") return (a === "") - (b === "");
  const x = Number(a), y = Number(b);
  return Number.isNaN(x) || Number.isNaN(y) ? a.localeCompare(b, undefined, { numeric: true }) : x - y;
}

for (const table of document.querySelectorAll("table.sortable")) {
  const headers = [...table.rows[0].cells];
  headers.forEach((th, column) => {
    if (!th.textContent.trim()) return;
    const button = document.createElement("button");
    button.textContent = th.textContent;
    th.replaceChildren(button);
    button.addEventListener("click", () => {
      const ascending = th.getAttribute("aria-sort") !== "ascending";
      for (const header of headers) header.removeAttribute("aria-sort");
      th.setAttribute("aria-sort", ascending ? "ascending" : "descending");
      const rows = [...table.rows].slice(1);
      rows.sort((a, b) => {
        const x = value(a, column), y = value(b, column);
        if (x === "" || y === "") return compare(x, y);
        return ascending ? compare(x, y) : compare(y, x);
      });
      table.tBodies[0].append(...rows);
    });
  });
}
