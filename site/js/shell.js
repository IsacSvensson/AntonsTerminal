// Inmatningsraden: historik, kö och att hoppa över skrivanimationen.

export class Shell {
  constructor({ form, input, screen, printer, onCommand }) {
    this.form = form;
    this.input = input;
    this.printer = printer;
    this.onCommand = onCommand;
    this.history = [];
    this.hIdx = 0;
    this.busy = 0;
    this.queue = Promise.resolve();

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submit();
    });
    input.addEventListener('keydown', (e) => this.key(e));
    screen.addEventListener('click', (e) => {
      if (e.target.closest('a')) return;
      if (this.busy) this.printer.skipLine = true;
      if (!globalThis.getSelection?.()?.toString()) input.focus({ preventScroll: true });
    });
  }

  /** Kör en uppgift i tur och ordning efter tidigare utskrifter. */
  enqueue(task) {
    this.setBusy(1);
    this.queue = this.queue
      .then(task)
      .catch((err) => console.error(err))
      .finally(() => {
        this.setBusy(-1);
        if (!this.busy) this.printer.skipAll = false;
      });
    return this.queue;
  }

  setBusy(d) {
    this.busy += d;
    document.body.dataset.busy = String(this.busy);
  }

  submit() {
    const value = this.input.value;
    if (this.busy && !value.trim()) {
      this.printer.skipLine = true;
      return;
    }
    this.input.value = '';
    if (!value.trim()) return;
    if (this.busy) this.printer.skipAll = true;
    // lösenord visas aldrig på skärmen eller i historiken
    const shown = value.replace(/^(\s*test\s+visa\s+).+$/i, '$1••••');
    this.history.push(shown);
    this.hIdx = this.history.length;
    this.enqueue(async () => {
      this.printer.skipAll = false;
      this.printer.instant('u', '> ' + shown);
      await this.onCommand(value);
    });
  }

  key(e) {
    if (e.key === 'ArrowUp' && this.history.length) {
      e.preventDefault();
      this.hIdx = Math.max(0, this.hIdx - 1);
      this.input.value = this.history[this.hIdx] ?? '';
    } else if (e.key === 'ArrowDown' && this.history.length) {
      e.preventDefault();
      this.hIdx = Math.min(this.history.length, this.hIdx + 1);
      this.input.value = this.history[this.hIdx] ?? '';
    }
  }
}
