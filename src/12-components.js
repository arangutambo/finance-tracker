// --- Shared input components ---------------------------------------------------
// Quick add had the only autocomplete in the plugin. Every other input — the
// edit modal's category, the merchant map, goal keys, trip tags, account names —
// was a plain text box you had to spell exactly right, against values the plugin
// already knows. These two are that popup, generalised.

// Deliberately hand-rolled rather than Obsidian's AbstractInputSuggest, which
// would raise minAppVersion from 1.0.0 to 1.4.10. The keyboard behaviour is the
// one quick add established: arrows move, Tab or Enter accepts while the popup
// is open, Esc closes it, and once it is closed Enter belongs to the form again.
class FinanceSuggest {
  constructor(input, options = {}) {
    this.input = input;
    this.getItems = options.getItems || (() => []);
    this.onChoose = options.onChoose || (() => {});
    this.limit = Number.isFinite(options.limit) ? options.limit : 8;
    this.items = [];
    this.highlighted = 0;

    // Inside a modal, Obsidian handles Escape through the modal's key scope before
    // the input ever sees the keydown — so Escape meant to dismiss the popup
    // closed the whole modal instead, taking whatever was typed with it. Given
    // the scope, the popup claims Escape while it is open and lets it through
    // once it is not.
    this.scope = options.scope || null;
    if (this.scope && typeof this.scope.register === "function") {
      this._escapeHandler = this.scope.register([], "Escape", () => {
        if (!this.items.length) return true;
        this.close();
        return false;
      });
    }

    const host = input.parentElement;
    if (host) host.addClass("finance-suggest-host");
    this.popup = (host || input).createDiv({ cls: "finance-suggest-popup" });
    this.popup.hide();

    this._onInput = () => this.refresh();
    this._onFocus = () => this.refresh();
    this._onBlur = () => window.setTimeout(() => this.close(), 150);
    this._onKeyDown = (event) => this.handleKey(event);
    input.addEventListener("input", this._onInput);
    input.addEventListener("focus", this._onFocus);
    input.addEventListener("blur", this._onBlur);
    input.addEventListener("keydown", this._onKeyDown);
  }

  refresh() {
    const query = String(this.input.value || "");
    let items = [];
    try {
      items = this.getItems(query) || [];
    } catch (error) {
      console.error("[finance-tracker] suggestion source failed", error);
    }
    this.items = items.slice(0, this.limit);
    this.highlighted = 0;
    this.render();
  }

  render() {
    this.popup.empty();
    if (!this.items.length) {
      this.popup.hide();
      return;
    }
    this.popup.show();
    this.items.forEach((item, index) => {
      const row = this.popup.createDiv({
        cls: `finance-suggest-item${index === this.highlighted ? " is-highlighted" : ""}`,
      });
      if (item.kind) row.createSpan({ cls: "finance-suggest-kind", text: item.kind });
      row.createSpan({ cls: "finance-suggest-label", text: item.label ?? item.value });
      if (item.hint) row.createSpan({ cls: "finance-suggest-hint", text: item.hint });
      // mousedown, not click: blur would close the popup before a click landed.
      row.addEventListener("mousedown", (event) => {
        event.preventDefault();
        this.choose(item);
      });
    });
  }

  handleKey(event) {
    if (!this.items.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      this.highlighted = (this.highlighted + 1) % this.items.length;
      this.render();
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      this.highlighted = (this.highlighted - 1 + this.items.length) % this.items.length;
      this.render();
      return;
    }
    if (event.key === "Tab" || event.key === "Enter") {
      event.preventDefault();
      this.choose(this.items[this.highlighted]);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.close();
    }
  }

  choose(item) {
    if (!item) return;
    this.input.value = item.value;
    this.close();
    this.onChoose(item);
    this.input.dispatchEvent(new Event("change"));
  }

  close() {
    this.items = [];
    this.popup.empty();
    this.popup.hide();
  }

  destroy() {
    this.close();
    if (this._escapeHandler && typeof this.scope?.unregister === "function") {
      this.scope.unregister(this._escapeHandler);
    }
    this.input.removeEventListener("input", this._onInput);
    this.input.removeEventListener("focus", this._onFocus);
    this.input.removeEventListener("blur", this._onBlur);
    this.input.removeEventListener("keydown", this._onKeyDown);
    this.popup.remove();
  }
}

// Picking a category is two decisions — which group, then which kind — and a
// single text box makes you spell out both from memory. This is a search box for
// people who know what they want, chips for people who would rather recognise
// than recall, and anything typed that matches nothing is simply a new category.
class CategoryPicker {
  constructor(host, options = {}) {
    this.categories = options.categories || [];
    this.onChange = options.onChange || (() => {});
    this.value = core.normalizeCategoryPath(options.value || "");

    this.el = host.createDiv({ cls: "finance-category-picker" });
    const inputRow = this.el.createDiv({ cls: "finance-category-picker-input" });
    this.input = inputRow.createEl("input", {
      type: "text",
      attr: { placeholder: options.placeholder || "food/takeaway", "aria-label": "Category" },
    });
    this.input.value = this.value;
    this.suggest = new FinanceSuggest(this.input, {
      getItems: (query) => this.matches(query),
      onChoose: (item) => this.setValue(item.value),
      scope: options.scope,
    });
    this.input.addEventListener("change", () => this.setValue(this.input.value, { silentInput: true }));

    this.majorRow = this.el.createDiv({ cls: "finance-category-chips" });
    this.subRow = this.el.createDiv({ cls: "finance-category-chips is-sub" });
    this.renderChips();
  }

  matches(query) {
    const needle = core.normalizeCategoryPath(query);
    const seen = new Set();
    const out = [];
    for (const category of this.categories) {
      const path = core.normalizeCategoryPath(category.path || category);
      if (!path || seen.has(path)) continue;
      const hit = !needle || path.startsWith(needle) || path.split("/").some((segment) => segment.startsWith(needle));
      if (!hit) continue;
      seen.add(path);
      out.push({ value: path, label: core.displayCategoryPath(path), kind: "category" });
    }
    // Anything typed that matches nothing is a new category, not a mistake.
    if (needle && !seen.has(needle)) {
      out.unshift({ value: needle, label: `New: ${core.displayCategoryPath(needle)}`, kind: "new" });
    }
    return out;
  }

  majors() {
    const counts = new Map();
    for (const category of this.categories) {
      const path = core.normalizeCategoryPath(category.path || category);
      if (!path) continue;
      const major = path.split("/")[0];
      counts.set(major, (counts.get(major) || 0) + Number(category.count || 1));
    }
    return Array.from(counts.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 8)
      .map(([major]) => major);
  }

  children(major) {
    const seen = new Set();
    for (const category of this.categories) {
      const path = core.normalizeCategoryPath(category.path || category);
      if (!path.startsWith(`${major}/`)) continue;
      seen.add(path.split("/").slice(0, 2).join("/"));
    }
    return Array.from(seen).sort();
  }

  renderChips() {
    this.majorRow.empty();
    this.subRow.empty();
    const active = this.value.split("/")[0];
    for (const major of this.majors()) {
      const chip = this.majorRow.createEl("button", {
        cls: `finance-category-chip${major === active ? " is-active" : ""}`,
        text: core.titleCaseSegment(major),
        attr: { type: "button" },
      });
      chip.addEventListener("click", () => this.setValue(major));
    }
    if (!active) return;
    for (const child of this.children(active)) {
      const chip = this.subRow.createEl("button", {
        cls: `finance-category-chip is-sub${child === this.value ? " is-active" : ""}`,
        text: core.titleCaseSegment(child.split("/").pop()),
        attr: { type: "button" },
      });
      chip.addEventListener("click", () => this.setValue(child));
    }
  }

  setValue(value, options = {}) {
    this.value = core.normalizeCategoryPath(value);
    if (!options.silentInput) this.input.value = this.value;
    this.renderChips();
    this.onChange(this.value);
  }

  getValue() {
    return core.normalizeCategoryPath(this.input.value || this.value);
  }

  destroy() {
    this.suggest?.destroy();
  }
}

