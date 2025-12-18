# Initial Explanation Stage

Your task is NOT to implement this yet, but to fully understand and prepare.

Here is exactly what I need implemented:

```
支持PDF文件。
1. Add file按钮支持添加PDF文件，可多选。对于PDF文件，单个文件大小不超过100M。图片不超过10M。
2. page list中每个page前面加一个checkbox，用户可以选中多个page，用 Native UI的checkbox 实现
2. page list 的顶端加一个tool bar，tool bar 中不需要任何文字信息。有一个checkbox 用来选中/取消选中所有page，用 Native UI的checkbox 实现，位置与page-item中的checkbox对齐
3. tool bar 中的checkbox要能够区分部分选中和全选中
4. tool bar 中加一个删除按钮，只有当有page的checkbox 选中时才会显示
5. 该删除按钮与当前page-item中的删除按钮在外观和style上保持一致。鼠标放到删除按钮上，删除按钮变成红色
6. 用户点击删除按钮，删除该选中的page
7. 显示一个消息框，用户可以撤销删除操作
8. 消息框显示和消失的逻辑沿用当前逻辑，支持批量和单个删除
9. 重构当前的删除逻辑，使它能够单个或批量删除和恢复选中的page
```

---

Your responsibilities:

- Analyze and understand the existing codebase thoroughly.
- Determine exactly how this feature integrates, including dependencies, structure, edge cases (within reason, don't go overboard), and constraints.
- Clearly identify anything unclear or ambiguous in my description or the current implementation.
- List clearly all questions or ambiguities you need clarified.

Remember, your job is not to implement (yet). Just exploring, planning, and then asking me questions to ensure all ambiguities are covered. We will go back and forth until you have no further questions. Do NOT assume any requirements or scope beyond explicitly described details.

---

Once you've answered all of questions and it has nothing more to ask, paste in this prompt:

---

# Plan Creation Stage

Based on our full exchange, now, produce a markdown plan document (`plan.md`).

Requirements for the plan:

- Include clear, minimal, concise steps.
- Track the status of each step using these emojis:
  - 🟩 Done
  - 🟨 In Progress
  - 🟥 To Do
- Include dynamic tracking of overall progress percentage (at top).
- Do NOT add extra scope or unnecessary complexity beyond explicitly clarified details.
- Steps should be modular, elegant, minimal, and integrate seamlessly within the existing codebase.

Markdown Template Example:

```plan.md (example)
# (Example) Feature Implementation Plan

**Overall Progress:** `0%`

## Tasks:

- [ ] 🟥 **Step 1: Setup authentication module**
  - [ ] 🟥 Create authentication service class
  - [ ] 🟥 Implement JWT token handling
  - [ ] 🟥 Connect service to existing database schema

- [ ] 🟥 **Step 2: Develop frontend login UI**
  - [ ] 🟥 Design login page component (React)
  - [ ] 🟥 Integrate component with auth endpoints
  - [ ] 🟥 Add form validation and error handling

- [ ] 🟥 **Step 3: Add user session management**
  - [ ] 🟥 Set up session cookies securely
  - [ ] 🟥 Implement session renewal logic
  - [ ] 🟥 Handle session expiry and logout process

...
```

Again, for clarity, it's still not time to build yet. Just write the clear plan document. No extra complexity or extra scope beyond what we discussed. The plan should lead to simple, elegant, minimal code that does the job perfectly.

---

Now, once this plan is done, look it over, and if it looks good, then prompt it with:

---

Now implement precisely as planned, in full.

Implementation Requirements:

- Write elegant, minimal, modular code.
- Adhere strictly to existing code patterns, conventions, and best practices.
- Include thorough, clear comments/documentation within the code.
- As you implement each step:
  - Update the markdown tracking document with emoji status and overall progress percentage dynamically.