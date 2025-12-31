# UI 交互状态逻辑文档 (UI Interaction States)
本文档记录了三个核心组件在不同折叠/展开状态下的 UI 表现及按钮逻辑。
## 1. 组件概览
- **Page List (PL)**: 左
- **Page Viewer (PV)**: 中
- **Preview (PR)**: 右
---
## 2. 按钮定义 (Button Definition)
下表列出了所有与组件折叠/展开相关的按钮。
| 按钮 ID | 按钮名称 | 位置 | 作用 |
| :--- | :--- | :--- | :--- |
| **BTN-PL** | Page List Trigger | PL 与 PV 之间 | 切换 PL 折叠/展开 |
| **BTN-PV-COLLAPSE** | Collapse Viewer | PV 与 PR 之间 | 折叠 PV |
| **BTN-PV-EXPAND** | Expand Viewer | PV 与 PR 之间 | 展开 PV |
| **BTN-PR-COLLAPSE** | Collapse Preview | PV 与 PR 之间 | 折叠 PR |
| **BTN-PR-EXPAND** | Expand Preview | 右边缘 | 展开 PR |
---
## 3. 状态矩阵 (State Matrix)
下表总结了 6 种合法组合状态下，各组件的显示以及各按钮的可用性。
| 场景 ID | PL | PV | PR | BTN-PL | BTN-PV-COLLAPSE | BTN-PV-EXPAND | BTN-PR-COLLAPSE | BTN-PR-EXPAND |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **S1** | 展开 | 展开 | 展开 | 折叠 (`<`) | ✅ | - | ✅ | - |
| **S2** | 折叠 | 展开 | 展开 | 展开 (`>`) | ✅ | - | ✅ | - |
| **S3** | 展开 | 展开 | 折叠 | 折叠 (`<`) | - | - | - | ✅ |
| **S4** | 折叠 | 展开 | 折叠 | 展开 (`>`) | - | - | - | ✅ |
| **S5** | 展开 | 折叠 | 展开 | 折叠 (`<`) | - | ✅ | - | - |
| **S6** | 折叠 | 折叠 | 展开 | 展开 (`>`) | - | ✅ | - | - |
> [!IMPORTANT]
> PV 和 PR 不允许同时折叠

**图例**:
- `✅`: 按钮可用
- `-`: 按钮不可用/隐藏
- `折叠 (<)`: BTN-PL 显示为折叠图标
- `展开 (>)`: BTN-PL 显示为展开图标
---
## 4. 状态转移图 (State Transitions)
下表描述点击每个按钮后，从当前场景转移到的目标场景。
| 当前场景 | 点击 BTN-PL | 点击 BTN-PV-COLLAPSE | 点击 BTN-PV-EXPAND | 点击 BTN-PR-COLLAPSE | 点击 BTN-PR-EXPAND |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **S1** | → S2 | → S5 | - | → S3 | - |
| **S2** | → S1 | → S6 | - | → S4 | - |
| **S3** | → S4 | - | - | - | → S1 |
| **S4** | → S3 | - | - | - | → S2 |
| **S5** | → S6 | - | → S1 | - | - |
| **S6** | → S5 | - | → S2 | - | - |
---
## 5. 图标与交互规范
- **折叠方向**: 图标指向组件"消失"的方向。
  - 折叠 PL/PV (左/中) → `<`
  - 折叠 PR (右) → `>`
- **展开方向**: 图标指向组件"出现"的方向。
  - 展开 PL/PV (左/中) → `>`
  - 展开 PR (右) → `<`
- **视觉反馈**: 按钮悬停时变色并显示 Tooltip。