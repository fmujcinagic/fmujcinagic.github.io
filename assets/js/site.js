(function () {
  document.documentElement.classList.add("js");

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var revealEls = document.querySelectorAll(".reveal");
  if (!reduceMotion && "IntersectionObserver" in window) {
    var revealObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );
    revealEls.forEach(function (el) {
      revealObserver.observe(el);
    });
  } else {
    revealEls.forEach(function (el) {
      el.classList.add("is-visible");
    });
  }

  var topbar = document.querySelector(".topbar");
  var progress = document.querySelector(".progress");
  var ticking = false;

  function onScroll() {
    var y = window.scrollY || window.pageYOffset;
    if (topbar) {
      topbar.classList.toggle("is-scrolled", y > 8);
    }
    if (progress) {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.transform = "scaleX(" + (max > 0 ? Math.min(y / max, 1) : 0) + ")";
    }
    ticking = false;
  }

  window.addEventListener(
    "scroll",
    function () {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(onScroll);
      }
    },
    { passive: true }
  );
  onScroll();

  var toc = document.querySelector("[data-toc]");
  var headings = document.querySelectorAll(".content h2[id]");
  if (toc && headings.length >= 3) {
    var tocList = toc.querySelector(".toc-list");

    headings.forEach(function (heading) {
      var li = document.createElement("li");
      var a = document.createElement("a");
      a.href = "#" + heading.id;
      a.textContent = heading.textContent;
      li.appendChild(a);
      tocList.appendChild(li);
    });

    toc.hidden = false;

    if ("IntersectionObserver" in window) {
      var tocLinks = {};
      tocList.querySelectorAll("a").forEach(function (link) {
        tocLinks[decodeURIComponent(link.hash.slice(1))] = link;
      });

      var spy = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              Object.keys(tocLinks).forEach(function (key) {
                tocLinks[key].classList.remove("is-active");
              });
              var active = tocLinks[entry.target.id];
              if (active) {
                active.classList.add("is-active");
              }
            }
          });
        },
        { rootMargin: "-15% 0px -70% 0px" }
      );

      headings.forEach(function (heading) {
        spy.observe(heading);
      });
    }
  }

  document.querySelectorAll(".content pre > code").forEach(function (code) {
    var pre = code.parentElement;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "code-copy";
    btn.textContent = "Copy";

    btn.addEventListener("click", function () {
      var text = code.innerText;
      var done = function () {
        btn.textContent = "Copied";
        window.setTimeout(function () {
          btn.textContent = "Copy";
        }, 1600);
      };

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () {
          btn.textContent = "Failed";
        });
      } else {
        done();
      }
    });

    pre.appendChild(btn);
  });

  var filterChips = document.querySelectorAll(".filter-chip");
  if (filterChips.length) {
    var filterItems = document.querySelectorAll(".filter-item");

    filterChips.forEach(function (chip) {
      chip.addEventListener("click", function () {
        filterChips.forEach(function (other) {
          other.classList.remove("is-active");
        });
        chip.classList.add("is-active");

        var filter = chip.dataset.filter;
        filterItems.forEach(function (item) {
          var show = filter === "all" || item.dataset.platform === filter;
          item.hidden = !show;
          if (show && !reduceMotion) {
            item.classList.remove("card-in");
            void item.offsetWidth;
            item.classList.add("card-in");
          }
        });
      });
    });
  }

  document.querySelectorAll('a[href^="#"]').forEach(function (link) {
    if (link.hash.length < 2) {
      return;
    }
    link.addEventListener("click", function (event) {
      var target = document.getElementById(decodeURIComponent(link.hash.slice(1)));
      if (!target) {
        return;
      }
      event.preventDefault();
      var top = target.getBoundingClientRect().top + window.scrollY - 76;
      window.scrollTo({ top: top, behavior: reduceMotion ? "auto" : "smooth" });
      history.replaceState(null, "", link.hash);
    });
  });
})();
