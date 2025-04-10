// 视频信息缓存助手 - 弹出窗口脚本

document.addEventListener("DOMContentLoaded", function () {
  // 加载视频缓存
  loadVideoCache();

  // 绑定标签页切换事件
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      // 切换活动标签
      document
        .querySelectorAll(".tab")
        .forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");

      // 显示对应的内容
      const tabName = tab.dataset.tab;
      document.querySelectorAll(".tab-content").forEach((content) => {
        content.style.display = content.id === tabName ? "block" : "none";
      });

      // 如果切换到了设置标签，加载设置
      if (tabName === "settings") {
        loadSettings();
      }
    });
  });

  // 绑定搜索事件
  const searchInput = document.getElementById("search-input");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      filterVideos();
    });
  }

  // 绑定筛选按钮事件
  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".filter-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      filterVideos();
    });
  });

  // 绑定设置表单提交事件
  const settingsForm = document.getElementById("settings-form");
  if (settingsForm) {
    settingsForm.addEventListener("submit", (e) => {
      e.preventDefault();
      saveSettings();
    });
  }

  // 绑定重置设置按钮事件
  const resetBtn = document.getElementById("reset-settings");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      resetSettings();
    });
  }

  // 绑定清空缓存按钮事件
  const clearCacheBtn = document.getElementById("clear-cache");
  if (clearCacheBtn) {
    clearCacheBtn.addEventListener("click", () => {
      clearCache("all");
    });
  }

  // 绑定清空BiliBili缓存按钮事件
  const clearBilibiliBtn = document.getElementById("clear-bilibili");
  if (clearBilibiliBtn) {
    clearBilibiliBtn.addEventListener("click", () => {
      clearCache("bilibili");
    });
  }

  // 绑定清空YouTube缓存按钮事件
  const clearYoutubeBtn = document.getElementById("clear-youtube");
  if (clearYoutubeBtn) {
    clearYoutubeBtn.addEventListener("click", () => {
      clearCache("youtube");
    });
  }
});

// 加载视频缓存
function loadVideoCache() {
  chrome.storage.local.get("videoCache", (data) => {
    const videoCache = data.videoCache || [];

    // 计算BiliBili和YouTube的缓存数量
    const bilibiliVideos = videoCache.filter((v) => v.source === "bilibili");
    const youtubeVideos = videoCache.filter((v) => v.source === "youtube");

    // 更新缓存计数显示
    document.getElementById("cache-count").textContent = videoCache.length;
    document.getElementById("bilibili-count").textContent =
      bilibiliVideos.length;
    document.getElementById("youtube-count").textContent = youtubeVideos.length;

    renderVideoList(videoCache);
  });
}

// 渲染视频列表
function renderVideoList(videos) {
  const videoList = document.getElementById("video-list");
  if (!videoList) return;

  // 如果没有视频，显示空消息
  if (videos.length === 0) {
    videoList.innerHTML = '<div class="empty-message">暂无缓存视频</div>';
    return;
  }

  // 按时间降序排序
  videos.sort((a, b) => b.timestamp - a.timestamp);

  // 构建视频列表HTML
  let html = "";
  videos.forEach((video) => {
    // 格式化日期
    const date = new Date(video.timestamp);
    const dateStr = `${
      date.getMonth() + 1
    }/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(
      2,
      "0"
    )}`;

    // 源站图标样式
    let sourceClass = "";
    if (video.source === "bilibili") {
      sourceClass = "bilibili";
    } else if (video.source === "youtube") {
      sourceClass = "youtube";
    }

    html += `
      <div class="video-item" data-id="${video.id}">
        <div class="video-thumbnail">
          ${
            video.thumbnail
              ? `<img src="${video.thumbnail}" onerror="this.classList.add('error')">`
              : ""
          }
        </div>
        <div class="video-info">
          <div class="video-title">${video.title}</div>
          <div class="video-meta">
            <span class="video-time">${dateStr}</span>
            <span class="video-source ${sourceClass}">${
      video.source === "bilibili" ? "BiliBili" : "YouTube"
    }</span>
          </div>
        </div>
        <div class="video-actions">
          <button class="action-btn view-btn" data-url="${
            video.url
          }">查看</button>
          <button class="action-btn delete-btn" data-id="${
            video.id
          }">删除</button>
        </div>
      </div>
    `;
  });

  videoList.innerHTML = html;

  // 绑定视频项的事件
  document.querySelectorAll(".view-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const url = e.target.dataset.url;
      if (url) {
        chrome.tabs.create({ url });
      }
    });
  });

  document.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = e.target.dataset.id;
      if (id) {
        deleteVideo(id);
      }
    });
  });
}

// 过滤视频列表
function filterVideos() {
  chrome.storage.local.get("videoCache", (data) => {
    const videoCache = data.videoCache || [];
    const searchText = document
      .getElementById("search-input")
      ?.value.toLowerCase();
    const activeFilter =
      document.querySelector(".filter-btn.active")?.dataset.filter || "all";

    // 过滤视频
    const filteredVideos = videoCache.filter((video) => {
      // 根据搜索文本过滤
      const matchesSearch =
        !searchText || video.title.toLowerCase().includes(searchText);

      // 根据来源过滤
      const matchesSource =
        activeFilter === "all" ||
        (activeFilter === "bilibili" && video.source === "bilibili") ||
        (activeFilter === "youtube" && video.source === "youtube");

      return matchesSearch && matchesSource;
    });

    renderVideoList(filteredVideos);
  });
}

// 删除指定视频
function deleteVideo(id) {
  chrome.storage.local.get("videoCache", (data) => {
    const videoCache = data.videoCache || [];
    const newCache = videoCache.filter((video) => video.id !== id);

    chrome.storage.local.set({ videoCache: newCache }, () => {
      // 更新视频列表
      renderVideoList(newCache);

      // 更新缓存计数显示
      document.getElementById("cache-count").textContent = newCache.length;

      // 显示消息
      showMessage("视频已删除");
    });
  });
}

// 清空缓存 - 更新为支持不同平台的清空操作
function clearCache(platform) {
  let confirmMessage = "";

  switch (platform) {
    case "bilibili":
      confirmMessage = "确定要清空所有BiliBili缓存视频吗？";
      break;
    case "youtube":
      confirmMessage = "确定要清空所有YouTube缓存视频吗？";
      break;
    default:
      confirmMessage = "确定要清空所有缓存视频吗？";
  }

  if (confirm(confirmMessage)) {
    chrome.storage.local.get("videoCache", (data) => {
      let videoCache = data.videoCache || [];
      let newCache = [];

      // 根据不同平台进行清空
      if (platform === "all") {
        newCache = []; // 清空所有
      } else {
        newCache = videoCache.filter((video) => video.source !== platform);
      }

      chrome.storage.local.set({ videoCache: newCache }, () => {
        // 重新加载视频列表
        loadVideoCache();

        // 显示消息
        let message = "";
        switch (platform) {
          case "bilibili":
            message = "BiliBili缓存已清空";
            break;
          case "youtube":
            message = "YouTube缓存已清空";
            break;
          default:
            message = "所有缓存已清空";
        }

        showMessage(message);
      });
    });
  }
}

// 加载设置
function loadSettings() {
  chrome.storage.local.get("settings", (data) => {
    const settings = data.settings || {
      maxCacheBilibili: 100,
      maxCacheYouTube: 100,
      autoClear: true,
      clearInterval: 7,
      fastSaveMode: true, // 添加快速保存模式默认值
    };

    // 设置表单值
    document.getElementById("max-cache-bilibili").value =
      settings.maxCacheBilibili;
    document.getElementById("max-cache-youtube").value =
      settings.maxCacheYouTube;
    document.getElementById("auto-clear").checked = settings.autoClear;
    document.getElementById("clear-interval").value = settings.clearInterval;

    // 设置快速保存模式的值
    if (document.getElementById("fast-save-mode")) {
      document.getElementById("fast-save-mode").checked =
        settings.fastSaveMode !== false; // 默认为true
    }

    // 根据自动清除是否启用，设置清除间隔的禁用状态
    document.getElementById("clear-interval").disabled = !settings.autoClear;
  });
}

// 保存设置
function saveSettings() {
  const maxCacheBilibili =
    parseInt(document.getElementById("max-cache-bilibili").value) || 100;
  const maxCacheYouTube =
    parseInt(document.getElementById("max-cache-youtube").value) || 100;
  const autoClear = document.getElementById("auto-clear").checked;
  const clearInterval =
    parseInt(document.getElementById("clear-interval").value) || 7;

  // 获取快速保存模式设置
  const fastSaveMode = document.getElementById("fast-save-mode")
    ? document.getElementById("fast-save-mode").checked
    : true;

  const settings = {
    maxCacheBilibili: Math.max(maxCacheBilibili, 10), // 确保最大缓存不小于10
    maxCacheYouTube: Math.max(maxCacheYouTube, 10), // 确保最大缓存不小于10
    autoClear,
    clearInterval,
    fastSaveMode, // 添加快速保存模式设置
  };

  chrome.storage.local.set({ settings }, () => {
    showMessage("设置已保存");
  });
}

// 重置设置
function resetSettings() {
  const defaultSettings = {
    maxCacheBilibili: 100,
    maxCacheYouTube: 100,
    autoClear: true,
    clearInterval: 7,
    fastSaveMode: true, // 添加快速保存模式默认值
  };

  chrome.storage.local.set({ settings: defaultSettings }, () => {
    // 重新加载设置
    loadSettings();
    // 显示消息
    showMessage("设置已重置");
  });
}

// 显示消息
function showMessage(message, duration = 2000) {
  // 检查是否已存在消息元素
  let messageEl = document.querySelector(".message");

  // 如果不存在，创建一个
  if (!messageEl) {
    messageEl = document.createElement("div");
    messageEl.className = "message";
    document.body.appendChild(messageEl);
  }

  // 设置消息内容
  messageEl.textContent = message;
  messageEl.classList.remove("fade-out");

  // 设置定时器，在指定时间后淡出
  setTimeout(() => {
    messageEl.classList.add("fade-out");

    // 淡出动画完成后移除元素
    setTimeout(() => {
      if (messageEl.parentNode) {
        messageEl.parentNode.removeChild(messageEl);
      }
    }, 300);
  }, duration);
}

// 切换自动清除设置时，同步启用/禁用清除间隔输入框
if (document.getElementById("auto-clear")) {
  document.getElementById("auto-clear").addEventListener("change", (e) => {
    document.getElementById("clear-interval").disabled = !e.target.checked;
  });
}
