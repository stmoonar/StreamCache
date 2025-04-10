// 视频信息缓存助手 - 内容脚本

// 设置缓存视频数量 - 使用window对象保存以避免重复声明
if (typeof window.VIDEO_CACHE_COUNT === "undefined") {
  window.VIDEO_CACHE_COUNT = Number.MAX_SAFE_INTEGER; // 无限制，缓存所有找到的视频
}

// 初始化全局去重集合
if (!window.globalProcessedUrls) {
  window.globalProcessedUrls = new Set();
}

// 跟踪当前页面的视频数据，即使在快速刷新时也能保存
if (!window.currentPageVideos) {
  window.currentPageVideos = [];
}

// 创建请求队列和防抖控制变量
if (!window.videoRequestQueue) {
  window.videoRequestQueue = [];
  window.isProcessingQueue = false;
  window.lastExtractTime = 0;
  window.pendingExtraction = false;
  window.fastSaveMode = true; // 默认启用快速保存模式
}

// 立即检查快速保存模式设置
setTimeout(() => {
  try {
    chrome.runtime.sendMessage(
      { action: "checkFastSaveMode" },
      function (response) {
        if (response && response.fastSaveMode !== undefined) {
          window.fastSaveMode = response.fastSaveMode;
          console.log(
            "视频信息缓存助手: 快速保存模式设置为",
            window.fastSaveMode
          );
        }
      }
    );
  } catch (e) {
    console.warn("视频信息缓存助手: 检查快速保存模式失败", e);
  }
}, 500);

// 添加防抖函数
function debounce(fn, delay) {
  let timer = null;
  return function (...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn.apply(this, args);
      timer = null;
    }, delay);
  };
}

// 添加节流函数
function throttle(fn, delay) {
  let lastCall = 0;
  return function (...args) {
    const now = Date.now();
    if (now - lastCall >= delay) {
      fn.apply(this, args);
      lastCall = now;
    }
  };
}

// 创建一个同步存储视频数据的函数
function fastSaveCurrentVideos() {
  if (!window.currentPageVideos || window.currentPageVideos.length === 0) {
    return;
  }

  try {
    const videosToSave = [...window.currentPageVideos];
    console.log(
      "视频信息缓存助手: 执行快速保存操作，缓存视频数量:",
      videosToSave.length
    );

    // 防止重复保存
    window.currentPageVideos = [];

    // 使用同步请求确保数据发送
    const xhr = new XMLHttpRequest();
    xhr.open("POST", chrome.runtime.getURL("/_empty_"), false); // 同步请求
    xhr.setRequestHeader("Content-Type", "application/json");
    try {
      xhr.send(
        JSON.stringify({
          action: "saveVideos",
          videos: videosToSave,
          fastSave: true,
        })
      );
    } catch (e) {
      // 忽略网络错误，这是预期的
    }

    // 同时尝试使用消息API发送
    chrome.runtime.sendMessage(
      {
        action: "saveVideos",
        videos: videosToSave,
        fastSave: true,
      },
      () => {}
    );
  } catch (e) {
    console.error("视频信息缓存助手: 快速保存失败", e);
  }
}

// 使用MutationObserver监控DOM变化，以检测页面即将刷新的迹象
function setupFastSaveObserver() {
  // 监控<html>或<body>元素的移除，这通常发生在页面刷新或导航时
  const fastSaveObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.removedNodes.length > 0) {
        // 检测到重大DOM变化，可能是页面即将刷新或导航
        if (window.currentPageVideos.length > 0) {
          console.log("视频信息缓存助手: 检测到DOM大量移除，尝试快速保存");
          fastSaveCurrentVideos();
          break;
        }
      }
    }
  });

  // 监视整个文档的变化
  fastSaveObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

// 在页面加载完成后执行初始提取
window.addEventListener("load", () => {
  console.log("视频信息缓存助手: 页面加载完成，准备提取视频信息");

  // 立即执行一次提取，确保基本视频信息被捕获
  setTimeout(() => safeExecution(extractVideoInfo), 300);

  // 设置更精确的内容变化监听
  setupTargetedContentObservers();

  // 设置快速保存观察器
  setupFastSaveObserver();

  // 监听页面卸载前的各种事件
  setupPageExitListeners();
});

// 设置页面退出相关的监听器
function setupPageExitListeners() {
  // beforeunload事件 - 页面即将卸载
  window.addEventListener("beforeunload", () => {
    console.log("视频信息缓存助手: 页面即将卸载，尝试保存视频数据");
    fastSaveCurrentVideos();
  });

  // unload事件 - 页面正在卸载
  window.addEventListener("unload", () => {
    console.log("视频信息缓存助手: 页面正在卸载，执行最后的保存尝试");
    fastSaveCurrentVideos();
  });

  // pagehide事件 - 页面隐藏(更可靠地检测页面离开)
  window.addEventListener("pagehide", () => {
    console.log("视频信息缓存助手: 页面隐藏，执行保存");
    fastSaveCurrentVideos();
  });

  // 监听浏览器性能事件
  try {
    if (window.performance && window.performance.getEntriesByType) {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === "navigation" && entry.type === "reload") {
            console.log("视频信息缓存助手: 检测到导航刷新，执行保存");
            fastSaveCurrentVideos();
          }
        }
      });
      observer.observe({ entryTypes: ["navigation"] });
    }
  } catch (e) {
    console.warn("视频信息缓存助手: 性能观察器设置失败", e);
  }

  // 周期性保存检查
  setInterval(() => {
    if (window.currentPageVideos.length > 0 && window.fastSaveMode) {
      console.log(
        "视频信息缓存助手: 执行周期性保存，当前视频数量:",
        window.currentPageVideos.length
      );
      fastSaveCurrentVideos();
    }
  }, 5000); // 每5秒检查一次
}

// 设置针对特定目标容器的观察器
function setupTargetedContentObservers() {
  console.log("视频信息缓存助手: 设置针对性内容监听");

  // 记录找到的容器元素，用于调试
  window.monitoredContainers = {
    bilibili: null,
    youtube: null,
  };

  // 使用防抖处理B站视频提取
  const debouncedBilibiliExtract = debounce(() => {
    console.log("视频信息缓存助手: 执行防抖后的B站视频提取");
    extractBilibiliV8Videos();
  }, 300);

  // 使用防抖处理YouTube视频提取
  const debouncedYoutubeExtract = debounce(() => {
    console.log("视频信息缓存助手: 执行防抖后的YouTube视频提取");
    extractYouTubeTargetedVideos();
  }, 300);

  // 创建针对B站版本8容器的专用观察器
  const biliBiliV8Observer = new MutationObserver((mutations) => {
    let hasRelevantChanges = false;

    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;

          const isVideoCard =
            (node.classList &&
              (node.classList.contains("bili-video-card") ||
                node.classList.contains("feed-card"))) ||
            node.querySelector?.(".bili-video-card, .feed-card");

          if (isVideoCard) {
            console.log("视频信息缓存助手: 检测到新增视频卡片:", node);
            hasRelevantChanges = true;
            window.pendingExtraction = true;
            break;
          }
        }
      }

      if (hasRelevantChanges) break;
    }

    if (hasRelevantChanges) {
      console.log("视频信息缓存助手: 检测到B站V8容器内视频变化，准备提取");
      debouncedBilibiliExtract();
    }
  });

  // 创建针对YouTube内容容器的专用观察器
  const youtubeGridObserver = new MutationObserver((mutations) => {
    console.log("视频信息缓存助手: YouTube网格容器发生变化，分析变化类型");

    let addedNodes = 0;
    let hasRichItemAddition = false;

    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        addedNodes += mutation.addedNodes.length;

        const hasItems = Array.from(mutation.addedNodes).some((node) => {
          if (node.nodeType !== Node.ELEMENT_NODE) return false;

          const hasItem =
            node.tagName === "YTD-RICH-ITEM-RENDERER" ||
            node.querySelectorAll("ytd-rich-item-renderer").length > 0;

          if (hasItem) {
            console.log("视频信息缓存助手: 检测到新增YouTube视频项:", node);
            window.pendingExtraction = true;
            return true;
          }
          return false;
        });

        if (hasItems) {
          hasRichItemAddition = true;
        }
      }
    }

    console.log(
      `视频信息缓存助手: YouTube容器变化统计 - 新增节点: ${addedNodes}, 含视频项: ${hasRichItemAddition}`
    );

    if (hasRichItemAddition || addedNodes > 3) {
      console.log(
        "视频信息缓存助手: 检测到YouTube网格容器内视频项变化，准备提取"
      );
      debouncedYoutubeExtract();
    }
  });

  const documentObserver = new MutationObserver(() => {
    if (location.href.includes("bilibili.com")) {
      const targetContainer = document.querySelector(
        ".container.is-version8[data-v-3581b8d4]"
      );

      if (targetContainer && !targetContainer.hasAttribute("data-observed")) {
        console.log("视频信息缓存助手: 找到目标B站V8容器，设置监听");
        targetContainer.setAttribute("data-observed", "true");

        processV8Container(targetContainer);

        biliBiliV8Observer.observe(targetContainer, {
          childList: true,
          subtree: true,
          attributes: false,
        });

        console.log("视频信息缓存助手: 目标容器监听已设置");
      }

      const generalContainer = document.querySelector(".container.is-version8");
      if (
        generalContainer &&
        !generalContainer.hasAttribute("data-observed") &&
        generalContainer !== targetContainer
      ) {
        console.log("视频信息缓存助手: 找到一般B站V8容器，设置备用监听");
        generalContainer.setAttribute("data-observed", "true");

        biliBiliV8Observer.observe(generalContainer, {
          childList: true,
          subtree: true,
          attributes: false,
        });
      }
    }

    if (location.href.includes("youtube.com")) {
      const ytGridContainer = document.querySelector(
        "div#contents.style-scope.ytd-rich-grid-renderer"
      );

      if (ytGridContainer && !ytGridContainer.getAttribute("data-observed")) {
        console.log(
          "视频信息缓存助手: 找到YouTube网格容器，设置专门监听:",
          ytGridContainer
        );
        ytGridContainer.setAttribute("data-observed", "true");

        window.monitoredContainers.youtube = ytGridContainer;

        extractYouTubeTargetedVideos();

        youtubeGridObserver.observe(ytGridContainer, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["class", "style", "src", "data-src"],
        });

        console.log("视频信息缓存助手: YouTube网格容器监听已设置完成");
      } else if (!ytGridContainer) {
        if (!window.youtubeContainerRetryCount) {
          window.youtubeContainerRetryCount = 0;
        }

        if (window.youtubeContainerRetryCount < 10) {
          window.youtubeContainerRetryCount++;
          console.log(
            `视频信息缓存助手: 未找到YouTube网格容器，将在1秒后重试(${window.youtubeContainerRetryCount}/10)`
          );

          setTimeout(() => {
            const retryContainer = document.querySelector(
              "div#contents.style-scope.ytd-rich-grid-renderer"
            );
            if (retryContainer) {
              console.log("视频信息缓存助手: 重试成功，找到YouTube网格容器");
              if (!retryContainer.getAttribute("data-observed")) {
                retryContainer.setAttribute("data-observed", "true");
                window.monitoredContainers.youtube = retryContainer;
                extractYouTubeTargetedVideos();
                youtubeGridObserver.observe(retryContainer, {
                  childList: true,
                  subtree: true,
                  attributes: true,
                  attributeFilter: ["class", "style", "src", "data-src"],
                });
              }
            }
          }, 1000);
        }
      }
    }
  });

  documentObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  // 使用节流函数优化滚动处理
  const throttledScrollHandler = throttle(() => {
    if (location.href.includes("bilibili.com")) {
      const container =
        document.querySelector(".container.is-version8[data-v-3581b8d4]") ||
        document.querySelector(".container.is-version8");

      if (container) {
        console.log("视频信息缓存助手: 滚动停止，重新检查容器内容");
        window.pendingExtraction = true;
        processV8Container(container);
      }
    } else if (location.href.includes("youtube.com")) {
      window.pendingExtraction = true;
      extractYouTubeTargetedVideos();
    }
  }, 800);

  let scrollTimeout;
  window.addEventListener("scroll", () => {
    if (scrollTimeout) clearTimeout(scrollTimeout);

    scrollTimeout = setTimeout(() => {
      throttledScrollHandler();
    }, 1000);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      console.log("视频信息缓存助手: 页面变为可见，检查是否有新内容");

      if (location.href.includes("bilibili.com")) {
        extractBilibiliV8Videos();
      } else if (location.href.includes("youtube.com")) {
        extractYouTubeTargetedVideos();
      }
    }
  });

  let lastUrl = location.href;
  const urlCheckInterval = setInterval(() => {
    if (location.href !== lastUrl) {
      console.log(`视频信息缓存助手: URL变化 ${lastUrl} -> ${location.href}`);

      lastUrl = location.href;

      document.querySelectorAll("[data-observed]").forEach((el) => {
        el.removeAttribute("data-observed");
      });

      window.bilibiliContainerRetryCount = 0;
      window.youtubeContainerRetryCount = 0;

      window.monitoredContainers = {
        bilibili: null,
        youtube: null,
      };

      console.log(
        `视频信息缓存助手: 当前URL缓存数量: ${window.globalProcessedUrls.size}`
      );

      setTimeout(() => {
        if (location.href.includes("bilibili.com")) {
          extractBilibiliV8Videos();
        } else if (location.href.includes("youtube.com")) {
          extractYouTubeTargetedVideos();
        }
      }, 1000);
    }
  }, 500);

  // 监听F5键和浏览器刷新按钮
  document.addEventListener("keydown", function (e) {
    if (e.key === "F5" || (e.ctrlKey && e.key === "r")) {
      console.log("视频信息缓存助手: 检测到刷新快捷键，执行快速保存");
      fastSaveCurrentVideos();
    }
  });

  // 监听鼠标右键菜单
  document.addEventListener("contextmenu", function () {
    // 右键菜单可能会导致刷新操作，预先保存
    if (window.currentPageVideos.length > 0) {
      console.log("视频信息缓存助手: 检测到右键菜单，预防性保存");
      fastSaveCurrentVideos();
    }
  });
}

// 处理视频请求队列
function processVideoRequestQueue() {
  if (window.isProcessingQueue || window.videoRequestQueue.length === 0) {
    return;
  }

  window.isProcessingQueue = true;
  const request = window.videoRequestQueue.shift();

  console.log(
    `视频信息缓存助手: 处理队列请求，当前队列长度: ${window.videoRequestQueue.length}`
  );

  sendMessageSafely(request.message, (response) => {
    console.log(`视频信息缓存助手: 队列请求处理完成`, response);
    window.isProcessingQueue = false;

    // 延迟处理下一个请求
    setTimeout(() => {
      processVideoRequestQueue();
    }, 100);

    if (request.callback) {
      request.callback(response);
    }
  });
}

// 优化的安全发送消息函数，加入队列机制
function sendMessageSafely(message, callback) {
  try {
    // 快速保存逻辑 - 对于saveVideos的请求
    if (message.action === "saveVideos" && window.fastSaveMode) {
      // 确保当前页面的视频集合包含这些视频
      if (!message.isEmergency) {
        const videosToAdd = message.videos.filter(
          (v) =>
            !window.currentPageVideos.some((existing) => existing.url === v.url)
        );
        if (videosToAdd.length > 0) {
          window.currentPageVideos.push(...videosToAdd);
        }
      }
    }

    // 标准消息发送逻辑
    chrome.runtime.sendMessage(message, (response) => {
      if (!handleRuntimeError() && callback) {
        callback(response);
      }
    });
  } catch (error) {
    console.error("视频信息缓存助手: 消息发送失败:", error);

    // 如果是保存请求且在快速保存模式下，确保数据至少被本地保存
    if (message.action === "saveVideos" && window.fastSaveMode) {
      console.log("视频信息缓存助手: 尝试使用备用保存机制");
      // 将视频添加到当前页面视频集合
      window.currentPageVideos.push(...message.videos);
    }
  }
}

// 优化B站数据提取函数，添加紧急模式参数
function extractCardsAndSave(cards, isEmergency = false) {
  console.log(
    `视频信息缓存助手: 开始提取 ${cards.length} 个元素的信息${
      isEmergency ? "（紧急模式）" : ""
    }`
  );

  const videos = [];
  const processedUrls = new Set();

  // 在紧急模式下提高处理效率
  const maxCardsToProcess = isEmergency
    ? cards.length
    : Math.min(cards.length, 50);

  for (let i = 0; i < maxCardsToProcess; i++) {
    try {
      const card = cards[i];
      let linkElement = null;

      if (card.classList && card.classList.contains("bili-video-card")) {
        linkElement = card.querySelector(".bili-video-card__image--link");
        if (!linkElement) {
          linkElement = card.querySelector('a[href*="/video/"]');
        }
      } else if (card.classList && card.classList.contains("feed-card")) {
        linkElement = card.querySelector('a[href*="/video/"]');
      } else if (
        card.tagName === "A" &&
        card.href &&
        card.href.includes("/video/")
      ) {
        linkElement = card;
      } else {
        linkElement = card.querySelector('a[href*="/video/"]');
      }

      if (!linkElement || !linkElement.href) continue;

      let url;
      try {
        url = new URL(linkElement.href, location.origin).href.split("?")[0];
      } catch (e) {
        continue;
      }

      if (processedUrls.has(url) || window.globalProcessedUrls?.has(url))
        continue;
      processedUrls.add(url);
      if (window.globalProcessedUrls) window.globalProcessedUrls.add(url);

      const videoInfo = extractVideoInfoFromElement(card, linkElement, url);
      if (videoInfo) {
        videos.push(videoInfo);

        // 重要：同时添加到当前页面视频集合，便于快速保存
        if (window.fastSaveMode && !isEmergency) {
          window.currentPageVideos.push(videoInfo);
        }
      }
    } catch (error) {
      console.error("视频信息缓存助手: 处理单个卡片时出错", error);
    }
  }

  console.log(`视频信息缓存助手: 成功提取 ${videos.length} 个视频信息`);

  // 如果是紧急模式，立即执行快速保存并启动标准保存
  if (isEmergency) {
    // 添加到当前页面视频集合
    window.currentPageVideos.push(...videos);
    fastSaveCurrentVideos();
  }

  if (videos.length > 0) {
    sendMessageSafely(
      {
        action: "saveVideos",
        videos,
        isEmergency: isEmergency,
      },
      (response) => {
        console.log(
          `视频信息缓存助手: 已发送 ${videos.length} 个B站视频信息:`,
          response
        );
      }
    );
  }
}

// 处理V8容器的优化函数，添加紧急模式参数
function processV8Container(container, isEmergency = false) {
  console.log(
    `视频信息缓存助手: 处理V8容器中的视频卡片${
      isEmergency ? "（紧急模式）" : ""
    }`
  );

  // 在紧急模式下使用更宽松的选择器直接提取
  if (isEmergency) {
    const allVideoCards = container.querySelectorAll(
      ".bili-video-card, .feed-card"
    );
    const videoLinks = container.querySelectorAll('a[href*="/video/"]');

    console.log(
      `视频信息缓存助手: 紧急模式找到 ${allVideoCards.length} 个卡片和 ${videoLinks.length} 个链接`
    );

    if (allVideoCards.length > 0) {
      extractCardsAndSave(Array.from(allVideoCards), true);
      return;
    }

    if (videoLinks.length > 0) {
      extractCardsAndSave(Array.from(videoLinks), true);
      return;
    }
  }

  const feedCards = container.querySelectorAll(
    "div[data-v-3581b8d4].feed-card"
  );
  const videoCards = container.querySelectorAll(
    "div[data-v-3581b8d4].bili-video-card.is-rcmd.enable-no-interest"
  );

  console.log(
    `视频信息缓存助手: 精确匹配找到 ${feedCards.length} 个feed-card和 ${videoCards.length} 个bili-video-card`
  );

  if (feedCards.length + videoCards.length < 5) {
    console.log("视频信息缓存助手: 精确匹配找到的卡片数量不足，使用宽松选择器");

    const relaxedFeedCards = container.querySelectorAll(".feed-card");
    const relaxedVideoCards = container.querySelectorAll(
      ".bili-video-card.is-rcmd.enable-no-interest"
    );
    const allVideoCards = container.querySelectorAll(".bili-video-card");

    console.log(
      `视频信息缓存助手: 宽松选择器找到 ${relaxedFeedCards.length} 个feed-card, ` +
        `${relaxedVideoCards.length} 个特定bili-video-card, ` +
        `${allVideoCards.length} 个一般bili-video-card`
    );

    const allCards = [
      ...Array.from(feedCards),
      ...Array.from(videoCards),
      ...Array.from(relaxedFeedCards),
      ...Array.from(relaxedVideoCards),
    ];

    if (allCards.length < 5 && allVideoCards.length > 0) {
      allCards.push(...Array.from(allVideoCards));
    }

    const uniqueCards = Array.from(new Set(allCards));
    console.log(
      `视频信息缓存助手: 去重后共有 ${uniqueCards.length} 个卡片待处理`
    );

    if (uniqueCards.length > 0) {
      extractCardsAndSave(uniqueCards);
      return;
    }
  } else {
    const cards = [...Array.from(feedCards), ...Array.from(videoCards)];
    console.log(
      `视频信息缓存助手: 精确匹配找到 ${cards.length} 个卡片，开始处理`
    );
    extractCardsAndSave(cards);
    return;
  }

  console.log("视频信息缓存助手: 常规方法未找到足够卡片，使用视频链接选择器");
  const videoLinks = container.querySelectorAll('a[href*="/video/"]');

  if (videoLinks.length > 0) {
    console.log(`视频信息缓存助手: 找到 ${videoLinks.length} 个视频链接`);
    extractCardsAndSave(Array.from(videoLinks));
    return;
  }

  console.log("视频信息缓存助手: 所有方法均未找到视频卡片，尝试检查整个DOM树");
  console.log("容器内部HTML结构片段:", container.innerHTML.substring(0, 1000));

  const potentialElements = findPotentialVideoElements(container);
  if (potentialElements.length > 0) {
    console.log(
      `视频信息缓存助手: 通过DOM遍历找到 ${potentialElements.length} 个潜在视频元素`
    );
    extractCardsAndSave(potentialElements);
  } else {
    console.log("视频信息缓存助手: 无法找到任何视频元素");
  }
}

// 优化YouTube备用元素提取，添加紧急模式
function extractYouTubeBackupElements(elements, isEmergency = false) {
  const videos = [];
  const processedUrls = new Set();

  console.log(
    `视频信息缓存助手: 开始从YouTube备用元素提取视频，共 ${
      elements.length
    } 个元素${isEmergency ? "（紧急模式）" : ""}`
  );

  // 在紧急模式下提高处理效率
  const maxElementsToProcess = isEmergency
    ? elements.length
    : Math.min(elements.length, 50);

  for (let i = 0; i < maxElementsToProcess; i++) {
    try {
      const element = elements[i];

      let linkElement = null;

      if (element.tagName === "A" && element.id === "thumbnail") {
        linkElement = element;
      } else {
        linkElement =
          element.querySelector("a#thumbnail") ||
          element.querySelector("a[href*='watch?v=']");
      }

      if (!linkElement || !linkElement.href) continue;

      let url = linkElement.href.split("&")[0];

      if (!url.includes("watch?v=")) continue;

      if (window.globalProcessedUrls.has(url) || processedUrls.has(url)) {
        continue;
      }

      processedUrls.add(url);
      window.globalProcessedUrls.add(url);

      const videoId = url.split("watch?v=")[1];
      if (!videoId) continue;

      let titleElement =
        element.querySelector("#video-title") ||
        element.querySelector("[id*='title']");

      if (!titleElement && element.parentElement) {
        titleElement =
          element.parentElement.querySelector("#video-title") ||
          element.parentElement.querySelector("[id*='title']");
      }

      if (!titleElement) {
        videos.push({
          title: `YouTube Video: ${videoId}`,
          url: url,
          thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        });
        continue;
      }

      const title = titleElement.textContent.trim();
      if (!title) continue;

      videos.push({
        title: title,
        url: url,
        thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      });
    } catch (error) {
      console.error("视频信息缓存助手: 处理YouTube备用元素时出错", error);
    }
  }

  console.log(
    `视频信息缓存助手: 从备用元素中提取出 ${videos.length} 个YouTube视频`
  );

  if (videos.length > 0) {
    sendMessageSafely(
      {
        action: "saveVideos",
        videos,
        isEmergency: isEmergency,
      },
      (response) => {
        console.log(
          `视频信息缓存助手: 已保存 ${videos.length} 个YouTube备用视频:`,
          response
        );
      }
    );
  }
}

// 优化YouTube网格视频提取函数，添加紧急模式
function extractYouTubeGridVideos(gridItems, maxCount, isEmergency = false) {
  const videos = [];
  const processedUrls = new Set();

  console.log(
    `视频信息缓存助手: 开始从YouTube网格提取${gridItems.length}条视频${
      isEmergency ? "（紧急模式）" : ""
    }`
  );

  // 在紧急模式下提高处理效率
  const maxItemsToProcess = isEmergency
    ? gridItems.length
    : Math.min(gridItems.length, 50);

  for (let i = 0; i < maxItemsToProcess; i++) {
    try {
      const gridItem = gridItems[i];

      const videoContainer = gridItem.querySelector("ytd-rich-grid-media");
      if (!videoContainer) {
        console.log("视频信息缓存助手: 未找到视频容器，尝试备用方法", gridItem);

        const directLink = gridItem.querySelector("a#thumbnail");
        if (directLink && directLink.href) {
          processYouTubeVideoLink(directLink, videos, processedUrls);
        }
        continue;
      }

      const linkElement = videoContainer.querySelector("a#thumbnail");
      if (!linkElement || !linkElement.href) {
        console.log("视频信息缓存助手: 未找到视频链接", videoContainer);
        continue;
      }

      processYouTubeVideoLink(linkElement, videos, processedUrls);
    } catch (itemError) {
      console.error(
        "视频信息缓存助手: 处理YouTube网格视频元素时出错",
        itemError
      );
    }
  }

  console.log(
    `视频信息缓存助手: 成功从YouTube网格提取${videos.length}个视频信息`
  );

  if (videos.length > 0) {
    sendMessageSafely(
      {
        action: "saveVideos",
        videos,
        isEmergency: isEmergency,
      },
      (response) => {
        console.log(
          `视频信息缓存助手: 已保存${videos.length}个YouTube网格视频:`,
          response
        );
      }
    );
  }
}

// 辅助函数：处理YouTube视频链接
function processYouTubeVideoLink(linkElement, videos, processedUrls) {
  let url = linkElement.href.split("&")[0];

  if (!url.includes("watch?v=")) return false;

  if (window.globalProcessedUrls.has(url) || processedUrls.has(url)) {
    return false;
  }

  processedUrls.add(url);
  window.globalProcessedUrls.add(url);

  const videoId = url.split("watch?v=")[1];
  if (!videoId) return false;

  let title = "";
  let titleElement = null;

  if (linkElement.parentElement) {
    titleElement = linkElement.parentElement.querySelector("#video-title");

    if (!titleElement) {
      let parent = linkElement.parentElement;
      for (let i = 0; i < 3 && parent && !titleElement; i++) {
        titleElement = parent.querySelector("#video-title");
        if (!titleElement) {
          parent = parent.parentElement;
        }
      }
    }
  }

  if (titleElement) {
    title = titleElement.textContent.trim();
  }

  if (!title) {
    title = `YouTube Video: ${videoId}`;
  }

  const thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  videos.push({
    title,
    url,
    thumbnail,
    source: "youtube",
  });

  return true;
}

// 处理运行时错误
function handleRuntimeError() {
  if (chrome.runtime.lastError) {
    console.warn(
      "视频信息缓存助手: 运行时错误:",
      chrome.runtime.lastError.message
    );
    return true;
  }
  return false;
}

// 检查扩展上下文是否有效
function isExtensionContextValid() {
  try {
    chrome.runtime.getURL("");
    return true;
  } catch (e) {
    console.warn("视频信息缓存助手: 扩展上下文无效，可能已被重新加载");
    return false;
  }
}

// 安全执行函数
function safeExecution(fn, ...args) {
  if (isExtensionContextValid()) {
    return fn.apply(this, args);
  }
}

// 新增函数：查找潜在的视频元素
function findPotentialVideoElements(container) {
  const results = [];

  function traverse(element) {
    if (element.classList) {
      const classStr = element.className.toString().toLowerCase();
      if (
        classStr.includes("video") ||
        classStr.includes("card") ||
        classStr.includes("feed")
      ) {
        results.push(element);
      }
    }

    if (
      element.tagName === "A" &&
      element.href &&
      element.href.includes("/video/")
    ) {
      results.push(element);
    }

    for (const child of element.children) {
      traverse(child);
    }
  }

  traverse(container);
  return results;
}

// 新增函数：从元素中提取视频信息
function extractVideoInfoFromElement(card, linkElement, url) {
  let title = "";
  let titleElement = null;

  if (card.classList && card.classList.contains("bili-video-card")) {
    titleElement = card.querySelector(".bili-video-card__info--tit");
  } else if (card.classList && card.classList.contains("feed-card")) {
    titleElement = card.querySelector(".title");
  }

  if (!titleElement) {
    const titleSelectors = [
      ".title",
      ".info-title",
      ".bili-video-card__info--tit",
      ".bili-video-card__info--desc",
      "[class*='title']",
      "h3",
      "p",
      "span",
      "div.info",
      "div.content",
    ];

    const searchLevels = [card, linkElement.parentElement, card.parentElement];

    for (const element of searchLevels) {
      if (!element) continue;

      for (const selector of titleSelectors) {
        titleElement = element.querySelector(selector);
        if (titleElement) break;
      }

      if (titleElement) break;
    }
  }

  if (titleElement) {
    title = titleElement.textContent.trim();
  } else {
    const bvidMatch = url.match(/\/video\/(BV[a-zA-Z0-9]+)/);
    if (bvidMatch && bvidMatch[1]) {
      title = "视频:" + bvidMatch[1];
    } else {
      return null;
    }
  }

  if (!title) return null;

  let thumbnail = "";

  if (card.classList && card.classList.contains("bili-video-card")) {
    const imgElement = card.querySelector(".bili-video-card__cover");
    if (imgElement) {
      const realImg =
        imgElement.tagName.toLowerCase() === "picture"
          ? imgElement.querySelector("img")
          : imgElement;

      if (realImg) {
        thumbnail = realImg.dataset.src || realImg.src;
      }
    }
  } else if (card.classList && card.classList.contains("feed-card")) {
    const imgElement = card.querySelector(".cover img");
    if (imgElement) {
      thumbnail = imgElement.dataset.src || imgElement.src;
    }
  }

  if (!thumbnail) {
    const imgSelectors = [
      'img[src*=".jpg"], img[src*=".png"]',
      ".cover img",
      "picture img",
      "img[data-src]",
      "img",
    ];

    const searchLevels = [linkElement, card, card.parentElement];

    for (const element of searchLevels) {
      if (!element) continue;

      for (const selector of imgSelectors) {
        const imgElement = element.querySelector(selector);
        if (imgElement && (imgElement.src || imgElement.dataset.src)) {
          thumbnail = imgElement.dataset.src || imgElement.src;
          break;
        }
      }

      if (thumbnail) break;
    }
  }

  if (thumbnail && !thumbnail.startsWith("http")) {
    thumbnail = thumbnail.startsWith("//")
      ? "https:" + thumbnail
      : new URL(thumbnail, location.origin).href;
  }

  return {
    title,
    url,
    thumbnail,
    source: "bilibili",
    timestamp: Date.now(),
  };
}

// 专门提取B站V8容器中的视频 - 更加精确的实现
function extractBilibiliV8Videos() {
  console.log("视频信息缓存助手: 开始提取B站V8容器视频");
  try {
    const v8Container = document.querySelector(
      ".container.is-version8[data-v-3581b8d4]"
    );

    if (!v8Container) {
      console.log("视频信息缓存助手: 未找到指定的B站V8容器，尝试备用方法");
      const backupContainer = document.querySelector(".container.is-version8");
      if (backupContainer) {
        console.log("视频信息缓存助手: 找到备用V8容器，继续提取");
        processV8Container(backupContainer);
        return;
      }

      extractBilibiliRecommendations();
      return;
    }

    console.log(
      "视频信息缓存助手: 找到指定的B站V8容器，提取内部视频",
      v8Container
    );

    processV8Container(v8Container);
  } catch (error) {
    console.error("视频信息缓存助手: 提取B站V8容器视频出错:", error);
  }
}

// 专门提取YouTube目标容器中的视频 - 改进的实现
function extractYouTubeTargetedVideos() {
  console.log("视频信息缓存助手: 开始提取YouTube目标容器视频");
  try {
    let ytGridContainer = window.monitoredContainers?.youtube;

    if (!ytGridContainer) {
      ytGridContainer = document.querySelector(
        "div#contents.style-scope.ytd-rich-grid-renderer"
      );
    }

    if (!ytGridContainer) {
      console.log("视频信息缓存助手: 未找到YouTube网格容器，尝试备用方法");
      extractYouTubeRecommendations();
      return;
    }

    console.log(
      "视频信息缓存助手: 找到YouTube网格容器，提取内部视频",
      ytGridContainer
    );

    const richItems = ytGridContainer.querySelectorAll(
      "ytd-rich-item-renderer"
    );

    console.log(
      `视频信息缓存助手: 在YouTube网格容器中找到 ${richItems.length} 个视频项`
    );

    if (richItems.length === 0) {
      console.log(
        "视频信息缓存助手: YouTube网格容器中未找到视频项，尝试备用选择器"
      );

      const backupSelectors = [
        "ytd-rich-grid-media",
        "a#thumbnail",
        "[id='dismissible']",
        "ytd-rich-grid-slim-media",
      ];

      for (const selector of backupSelectors) {
        const backupItems = ytGridContainer.querySelectorAll(selector);
        if (backupItems.length > 0) {
          console.log(
            `视频信息缓存助手: 通过备用选择器 ${selector} 找到 ${backupItems.length} 个元素`
          );
          extractYouTubeBackupElements(backupItems);
          return;
        }
      }

      console.log(
        "视频信息缓存助手: 所有选择器都未找到YouTube视频元素，记录容器结构:"
      );
      console.log(ytGridContainer.innerHTML.substring(0, 500) + "...");
      return;
    }

    window.VIDEO_CACHE_COUNT = Number.MAX_SAFE_INTEGER;
    extractYouTubeGridVideos(richItems, richItems.length);
  } catch (error) {
    console.error("视频信息缓存助手: 提取YouTube目标容器视频出错:", error);
  }
}

// 添加缺失的基础视频提取函数
function extractVideoInfo() {
  console.log("视频信息缓存助手: 执行页面视频提取");

  try {
    // 检测当前网站类型
    if (location.href.includes("bilibili.com")) {
      // B站提取逻辑
      extractBilibiliV8Videos();
      // 提取推荐视频
      extractBilibiliRecommendations();
    } else if (
      location.href.includes("youtube.com") ||
      location.href.includes("youtu.be")
    ) {
      // YouTube提取逻辑
      extractYouTubeTargetedVideos();
      // 提取推荐视频
      extractYouTubeRecommendations();
    }
  } catch (error) {
    console.error("视频信息缓存助手: 视频提取出错", error);
  }
}

// 添加缺失的B站推荐视频提取函数
function extractBilibiliRecommendations() {
  console.log("视频信息缓存助手: 提取B站推荐视频");

  // 寻找推荐视频容器
  const recommendContainers = [
    document.querySelector(".recommend-list"),
    document.querySelector(".rec-list"),
    document.querySelector(".video-page-card-small"),
    document.querySelector("[class*='recommend']"),
  ].filter(Boolean);

  if (recommendContainers.length === 0) {
    console.log("视频信息缓存助手: 未找到B站推荐视频容器");
    return;
  }

  // 处理找到的容器
  for (const container of recommendContainers) {
    const videoLinks = container.querySelectorAll('a[href*="/video/"]');
    if (videoLinks.length > 0) {
      console.log(
        `视频信息缓存助手: 找到 ${videoLinks.length} 个B站推荐视频链接`
      );
      extractCardsAndSave(Array.from(videoLinks));
    }
  }
}

// 添加缺失的YouTube推荐视频提取函数
function extractYouTubeRecommendations() {
  console.log("视频信息缓存助手: 提取YouTube推荐视频");

  // 寻找推荐视频容器
  const recommendContainers = [
    document.querySelector("ytd-watch-next-secondary-results-renderer"),
    document.querySelector("#related"),
    document.querySelector("#secondary"),
  ].filter(Boolean);

  if (recommendContainers.length === 0) {
    console.log("视频信息缓存助手: 未找到YouTube推荐视频容器");
    return;
  }

  // 处理找到的容器
  for (const container of recommendContainers) {
    const thumbnailLinks = container.querySelectorAll("a#thumbnail");
    if (thumbnailLinks.length > 0) {
      console.log(
        `视频信息缓存助手: 找到 ${thumbnailLinks.length} 个YouTube推荐视频链接`
      );
      extractYouTubeBackupElements(thumbnailLinks);
    }
  }
}

// 修复变量声明问题 - 替换原有的代码，使用判断检查是否存在
if (typeof originalExtractVideoInfo === "undefined") {
  const originalExtractVideoInfo = extractVideoInfo;
  window.extractVideoInfo = function () {
    safeExecution(originalExtractVideoInfo);
  };
} else {
  // 如果已经定义，只包装现有函数
  window.extractVideoInfo = function () {
    safeExecution(originalExtractVideoInfo || extractVideoInfo);
  };
}
