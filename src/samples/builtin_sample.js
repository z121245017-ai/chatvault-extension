(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ChatVaultSample = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  return {
    title: "DeepSeek-R1 Softmax 推导与 PyTorch 实现",
    platform: "deepseek",
    platformLabel: "DeepSeek",
    url: "https://chat.deepseek.com/a/chat/s/demo-softmax-r1",
    exportedAt: "2026-11-27T04:30:00.000Z",
    messages: [
      {
        index: 1,
        role: "user",
        content: "请给出数值稳定版 Softmax 公式推导，并提供带类型注解的 Python 实现。",
        reasoning: ""
      },
      {
        index: 2,
        role: "assistant",
        reasoning: [
          "1. 用户需要数值稳定版的 Softmax 推导，核心技巧是减去最大值 $m = \\max_j z_j$ 防止指数溢出。",
          "2. 需要同时给出行内公式与独立块级公式，确保 KaTeX 源码在导出后不丢。",
          "3. Python 示例应使用 NumPy 并附带清晰的类型注解与边界注释。"
        ].join("\n"),
        content: [
          "为了避免计算 $e^{z_i}$ 时发生浮点上溢，先令 $m = \\max_j z_j$，上下同乘 $e^{-m}$：",
          "",
          "$$",
          "\\text{Softmax}(z_i) = \\frac{e^{z_i - m}}{\\sum_{j=1}^{K} e^{z_j - m}}",
          "$$",
          "",
          "对应的 Python 实现如下：",
          "",
          "```python",
          "import numpy as np",
          "from numpy.typing import NDArray",
          "",
          "def stable_softmax(logits: NDArray[np.float64]) -> NDArray[np.float64]:",
          "    shifted = logits - np.max(logits, axis=-1, keepdims=True)",
          "    exp_vals = np.exp(shifted)",
          "    return exp_vals / np.sum(exp_vals, axis=-1, keepdims=True)",
          "```"
        ].join("\n")
      }
    ],
    stats: {
      messageCount: 2,
      reasoningCount: 1,
      formulaCount: 3,
      codeBlockCount: 1
    }
  };
});
