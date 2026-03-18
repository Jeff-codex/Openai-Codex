(() => {
  const CHANNEL_TALK_PLUGIN_KEY = "effcd765-65b5-49ca-b003-b18931fc6f38";

  function initChannelTalk() {
    const pluginKey = String(window.DLIVER_CHANNEL_TALK_PLUGIN_KEY || CHANNEL_TALK_PLUGIN_KEY || "").trim();
    if (!pluginKey) return;
    document.body?.classList.add("has-channel-talk");

    const w = window;
    if (w.ChannelIO) {
      try {
        w.ChannelIO("boot", { pluginKey });
        w.ChannelIO("showChannelButton");
        w.ChannelIO("hideMessenger");
      } catch (error) {}
      return;
    }

    const ch = function () {
      ch.c(arguments);
    };
    ch.q = [];
    ch.c = function (args) {
      ch.q.push(args);
    };
    w.ChannelIO = ch;

    function loadScript() {
      if (w.ChannelIOInitialized) return;
      w.ChannelIOInitialized = true;
      const s = document.createElement("script");
      s.async = true;
      s.src = "https://cdn.channel.io/plugin/ch-plugin-web.js";
      const x = document.getElementsByTagName("script")[0];
      x?.parentNode?.insertBefore(s, x);
    }

    if (document.readyState === "complete") {
      loadScript();
    } else {
      w.addEventListener("DOMContentLoaded", loadScript, { once: true });
      w.addEventListener("load", loadScript, { once: true });
    }

    w.ChannelIO("boot", { pluginKey });
    w.ChannelIO("showChannelButton");
    w.ChannelIO("hideMessenger");
  }

  initChannelTalk();
})();
