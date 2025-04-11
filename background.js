// 视频信息缓存助手 - 后台脚本

// 默认设置
const DEFAULT_SETTINGS = {
  maxCacheBilibili: 100, // BiliBili最大缓存视频数量
  maxCacheYouTube: 100, // YouTube最大缓存视频数量
  autoClear: true, // 是否自动清除
  clearInterval: 7, // 自动清除间隔（天）
  fastSaveMode: true, // 快速保存模式，默认开启
};

// 初始化设置
chrome.runtime.onInstalled.addListener(() => {
//   // 初始化设置
//   chrome.storage.local.get("settings", (data) => {
//     if (!data.settings) {
//       chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
//     } else {
//       // 迁移旧设置到新格式
//       const oldSettings = data.settings;
//       const newSettings = {
//         maxCacheBilibili: oldSettings.maxCache || 100,
//         maxCacheYouTube: oldSettings.maxCache || 100,
//         autoClear:
//           oldSettings.autoClear !== undefined ? oldSettings.autoClear : true,
//         clearInterval: oldSettings.clearInterval || 7,
//         fastSaveMode:
//           oldSettings.fastSaveMode !== undefined
//             ? oldSettings.fastSaveMode
//             : true,
//       };
//       chrome.storage.local.set({ settings: newSettings });
//     }
//   });

  // 初始化视频缓存和临时缓存区
  chrome.storage.local.get(["videoCache", "tempVideoData"], (data) => {
    if (!data.videoCache) {
      chrome.storage.local.set({ videoCache: [] });
    }

    // 检查是否有临时缓存数据需要恢复
    if (data.tempVideoData && data.tempVideoData.length > 0) {
      console.log(
        "视频信息缓存助手: 发现临时保存的数据，尝试恢复",
        data.tempVideoData.length
      );
      try {
        const recoveredVideos = data.tempVideoData.flatMap(
          (item) => item.videos || []
        );
        if (recoveredVideos.length > 0) {
          saveVideos(recoveredVideos, "recovered", true)
            .then(() => {
              console.log(
                "视频信息缓存助手: 成功恢复临时数据",
                recoveredVideos.length
              );
              // 清空临时存储
              chrome.storage.local.set({ tempVideoData: [] });
            })
            .catch((err) => {
              console.error("视频信息缓存助手: 恢复临时数据失败", err);
            });
        }
      } catch (e) {
        console.error("视频信息缓存助手: 处理临时数据出错", e);
        chrome.storage.local.set({ tempVideoData: [] }); // 重置错误的数据
      }
    } else if (!data.tempVideoData) {
      chrome.storage.local.set({ tempVideoData: [] });
    }
  });
});

// 监听标签页更新
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // 只在页面完成加载时处理
  if (changeInfo.status === "complete") {
    // 检查是否是目标网站
    const url = tab.url || "";
    if (isBilibili(url) || isYouTube(url)) {
      // 注入内容脚本
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ["content.js"],
      });
    }
  }
});

// 为快速刷新场景创建临时存储区
let pendingSaveRequests = new Map();

// 监听来自内容脚本的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "saveVideos") {
    // 提前返回响应，避免因页面关闭导致的通信失败
    sendResponse({ success: true, received: true });

    // 如果是快速保存或紧急模式，先存到临时区域
    if (message.isEmergency || message.fastSave) {
      // 为每个请求生成唯一标识
      const requestId =
        Date.now().toString() + Math.random().toString(16).substring(2, 8);

      // 保存到临时存储，这是同步操作，确保数据被保存
      chrome.storage.local.get("tempVideoData", (data) => {
        const tempData = data.tempVideoData || [];
        const newTempData = [
          ...tempData,
          {
            id: requestId,
            videos: message.videos,
            pageUrl: sender.tab?.url || "",
            timestamp: Date.now(),
          },
        ];

        // 限制临时存储大小，防止过大
        if (newTempData.length > 20) {
          newTempData.splice(0, newTempData.length - 20);
        }

        chrome.storage.local.set({ tempVideoData: newTempData }, () => {
          console.log(
            "视频信息缓存助手: 已保存到临时区域",
            message.videos.length,
            "请求ID:",
            requestId
          );
        });
      });
    }

    // 正常保存到主存储
    saveVideos(message.videos, sender.tab?.url || "", message.isEmergency)
      .then(() => {
        console.log(
          "视频信息缓存助手: 成功保存视频数据",
          message.videos.length
        );
        // 完成后可以清理对应的临时数据(在后续版本实现)
      })
      .catch((error) => {
        console.error("视频信息缓存助手: 保存视频失败", error);
      });

    return true; // 表示会异步发送响应
  } else if (message.action === "checkFastSaveMode") {
    // 查询当前的快速保存模式设置
    chrome.storage.local.get("settings", (data) => {
      const settings = data.settings || DEFAULT_SETTINGS;
      sendResponse({ fastSaveMode: settings.fastSaveMode });
    });
    return true; // 表示会异步发送响应
  }
});

// 添加定期处理临时数据的任务
setInterval(() => {
  chrome.storage.local.get("tempVideoData", (data) => {
    if (data.tempVideoData && data.tempVideoData.length > 0) {
      console.log(
        "视频信息缓存助手: 定期检查临时数据",
        data.tempVideoData.length
      );

      // 按时间排序，优先处理最新的数据
      const sortedData = [...data.tempVideoData].sort(
        (a, b) => b.timestamp - a.timestamp
      );

      // 只处理最新的5条，避免一次处理太多
      const toProcess = sortedData.slice(0, 5);
      const restData = sortedData.slice(5);

      // 将所有视频合并处理
      const allVideos = toProcess.flatMap((item) => item.videos || []);

      if (allVideos.length > 0) {
        saveVideos(allVideos, "temp_recovered", true)
          .then(() => {
            console.log("视频信息缓存助手: 成功处理临时数据", allVideos.length);
            // 更新临时存储
            chrome.storage.local.set({ tempVideoData: restData });
          })
          .catch((err) => {
            console.error("视频信息缓存助手: 处理临时数据出错", err);
          });
      }
    }
  });
}, 30000); // 每30秒检查一次

// 保存视频信息到缓存
async function saveVideos(videos, pageUrl, isEmergency = false) {
  // 获取当前缓存和设置
  const data = await chrome.storage.local.get(["videoCache", "settings"]);
  let videoCache = data.videoCache || [];
  const settings = data.settings || DEFAULT_SETTINGS;

  // 确定视频来源
  const source = isBilibili(pageUrl) ? "bilibili" : "youtube";

  // 处理新视频
  const timestamp = Date.now();
  const newVideos = videos.map((video) => ({
    ...video,
    id: generateId(),
    source,
    timestamp,
    pageUrl,
  }));

  // 紧急模式下使用更高效的去重算法
  if (isEmergency) {
    console.log("视频信息缓存助手后台: 使用紧急模式保存算法");

    // 映射表直接使用URL作为唯一键
    const existingUrls = new Set(videoCache.map((v) => v.url));
    const uniqueNewVideos = newVideos.filter((v) => !existingUrls.has(v.url));

    // 合并视频列表
    videoCache = [...uniqueNewVideos, ...videoCache];
  } else {
    // 使用原来的更精确算法
    // 先创建一个URL映射表，加速查找
    const urlMap = new Map();
    const titleMap = new Map();

    // 先添加所有新视频到映射表
    newVideos.forEach((video) => {
      urlMap.set(video.url, video);
      titleMap.set(video.title, video);
    });

    // 合并视频列表，避免重复
    const mergedVideos = [...newVideos];
    videoCache.forEach((oldVideo) => {
      // 检查是否已存在相同视频（根据URL或完全相同的标题判断）
      const existsByUrl = urlMap.has(oldVideo.url);
      const existsByTitle =
        titleMap.has(oldVideo.title) && oldVideo.source === source;
      if (!existsByUrl && !existsByTitle) {
        mergedVideos.push(oldVideo);
      }
    });

    videoCache = mergedVideos;
  }

  // 按来源分组视频
  const bilibiliVideos = videoCache.filter((v) => v.source === "bilibili");
  const youtubeVideos = videoCache.filter((v) => v.source === "youtube");

  // 按时间排序
  bilibiliVideos.sort((a, b) => b.timestamp - a.timestamp);
  youtubeVideos.sort((a, b) => b.timestamp - a.timestamp);

  // 根据各自的最大缓存数量进行截取
  if (bilibiliVideos.length > settings.maxCacheBilibili) {
    bilibiliVideos.splice(settings.maxCacheBilibili);
  }

  if (youtubeVideos.length > settings.maxCacheYouTube) {
    youtubeVideos.splice(settings.maxCacheYouTube);
  }

  // 合并两个来源的视频
  const processedVideos = [...bilibiliVideos, ...youtubeVideos];

  // 如果启用了自动清除，删除过期视频
  if (settings.autoClear) {
    const expirationTime =
      timestamp - settings.clearInterval * 24 * 60 * 60 * 1000;
    const filteredVideos = processedVideos.filter(
      (video) => video.timestamp >= expirationTime
    );
    await chrome.storage.local.set({ videoCache: filteredVideos });
  } else {
    await chrome.storage.local.set({ videoCache: processedVideos });
  }
}

// 生成唯一ID
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// 检查是否是哔哩哔哩网站
function isBilibili(url) {
  return url.includes("bilibili.com");
}

// 检查是否是YouTube网站
function isYouTube(url) {
  return url.includes("youtube.com") || url.includes("youtu.be");
}
