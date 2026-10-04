(() => {
  if (window.parent === window) return;
  const experience = document.getElementById("demo-experience");
  if (!experience) return;
  const notify = () => {
    window.parent.postMessage({ source: "anynanny-demo", open: experience.open === true }, "*");
  };
  experience.addEventListener("close", notify);
  new MutationObserver(notify).observe(experience, {
    attributes: true,
    attributeFilter: ["open"]
  });
  notify();
})();
