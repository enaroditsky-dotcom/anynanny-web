(() => {
  const buttons = document.querySelectorAll('[data-charter]');
  buttons.forEach(button => {
    const dialog = document.getElementById(button.dataset.charter);
    let previousOverflow = '';
    button.addEventListener('click', () => {
      if (dialog.open) return;
      previousOverflow = document.body.style.overflow;
      dialog.showModal();
      document.body.style.overflow = 'hidden';
      dialog.scrollTop = 0;
    });
    dialog.addEventListener('close', () => {
      document.body.style.overflow = previousOverflow;
      button.focus({ preventScroll: true });
    });
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right ||
          event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    });
  });
})();
