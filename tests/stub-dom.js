"use strict";

// A small stand-in for the element API Obsidian adds to HTMLElement
// (createDiv/createEl/addClass/…). It exists so the functional harness can run
// render code, not just the data code beneath it: a typo in a render path used
// to be invisible until the view was opened by hand.

class StubEl {
  constructor(tag = "div", options = {}) {
    const config = typeof options === "string" ? { cls: options } : options || {};
    this.tag = tag;
    this.children = [];
    this.classList = new Set(String(config.cls || "").split(/\s+/).filter(Boolean));
    this.text = String(config.text ?? "");
    this.attrs = { ...(config.attr || {}) };
    if (config.type) this.attrs.type = config.type;
    this.style = {};
    this.value = config.value ?? "";
    this.checked = false;
    this.disabled = false;
    this.hidden = false;
    this.listeners = new Map();
    this.parentElement = null;
  }

  _adopt(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  createDiv(options) { return this._adopt(new StubEl("div", options)); }
  createSpan(options) { return this._adopt(new StubEl("span", options)); }
  createEl(tag, options) { return this._adopt(new StubEl(tag, options)); }
  createSvg(tag, options) { return this._adopt(new StubEl(tag, options)); }

  empty() { this.children = []; }
  remove() {
    if (this.parentElement) {
      this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    }
  }

  setText(value) { this.text = String(value); }
  appendText(value) { this.text += String(value); }
  addClass(cls) { this.classList.add(cls); }
  removeClass(cls) { this.classList.delete(cls); }
  hasClass(cls) { return this.classList.has(cls); }
  toggleClass(cls, force) {
    const on = force === undefined ? !this.classList.has(cls) : force;
    if (on) this.classList.add(cls);
    else this.classList.delete(cls);
  }
  setAttribute(key, value) { this.attrs[key] = value; }
  setAttr(key, value) { this.attrs[key] = value; }
  getAttribute(key) { return this.attrs[key]; }
  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) || [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }
  removeEventListener(type, handler) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter((entry) => entry !== handler));
  }
  dispatchEvent(event) {
    this.fire(event?.type || "change");
    return true;
  }

  async fire(type, event = {}) {
    for (const handler of this.listeners.get(type) || []) {
      await handler({ preventDefault() {}, stopPropagation() {}, ...event });
    }
  }
  show() { this.hidden = false; }
  hide() { this.hidden = true; }
  focus() {}
  setSelectionRange() {}

  // --- helpers for tests ---------------------------------------------------

  allText() {
    return [this.text, ...this.children.map((child) => child.allText())].filter(Boolean).join(" | ");
  }

  find(predicate) {
    for (const child of this.children) {
      if (predicate(child)) return child;
      const deeper = child.find(predicate);
      if (deeper) return deeper;
    }
    return null;
  }

  findAll(predicate, found = []) {
    for (const child of this.children) {
      if (predicate(child)) found.push(child);
      child.findAll(predicate, found);
    }
    return found;
  }

  button(label) {
    return this.find((node) => node.tag === "button" && node.text.includes(label));
  }

  async click(label) {
    const target = typeof label === "string" ? this.button(label) : label;
    if (!target) throw new Error(`no button labelled "${label}" — saw: ${this.findAll((n) => n.tag === "button").map((n) => n.text).join(", ")}`);
    for (const handler of target.listeners.get("click") || []) {
      await handler({ preventDefault() {}, stopPropagation() {} });
    }
    return target;
  }
}

module.exports = { StubEl };
