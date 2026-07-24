# Business Requirements Document: Accounting AI Chat

## 1. Document purpose

Define a small, reply-only accounting assistant for the Accounting application using user-selected xAI Grok, GroqCloud, or Google Gemini APIs. The assistant must not read or modify application data, call application functions, or access the application database or source code.

## 2. Business objective

Give authenticated users a convenient way to ask general accounting and bookkeeping questions without leaving the application. The assistant may explain concepts and suggest example accounting entries, while remaining isolated from the application's operational data.

## 3. Scope

### In scope

- Text-only chat using xAI Grok, GroqCloud, or Google Gemini.
- General accounting and bookkeeping questions.
- Debit and credit explanations.
- Example journal entries, voucher types, and narrations.
- Identification of missing information required to answer an accounting question.
- A maximum of five examples or suggestions in a response.
- The most recent 10-20 chat messages as short-term conversational memory.
- Optional use of administrator-approved accounting PDFs as reference material in a later phase.
- Multiple user-supplied provider API keys that last only for the authenticated application session.
- Provider and model selection, with one configured provider active for chat at a time.

### Out of scope

- Reading or writing MongoDB or any other application database.
- Reading accounts, balances, journals, vouchers, reports, users, or company settings.
- Reading or changing application source code.
- Calling application APIs or executing application functions.
- Creating, editing, approving, deleting, or posting accounting entries.
- Automatically filling an application form.
- Web search, X search, code execution, or arbitrary external tools.
- Non-accounting advice or general-purpose chat.
- Persistent storage of AI provider keys or chat history.

## 4. Users and assumptions

- Only authenticated application users can configure a key or use chat.
- Each authenticated session may configure Grok, Groq, Gemini, or any combination of the three.
- Users obtain their own provider API access and remain responsible for provider usage and charges.
- The first release runs as a single FastAPI application instance/process.
- HTTPS is mandatory outside local development.

## 5. Functional requirements

### FR-1: Navigation and chat window

- An AI icon is displayed in the top navigation.
- The AI icon always opens the chat drawer or modal.
- If no valid key exists, the drawer shows setup guidance and a button that navigates to Settings.
- If any valid key exists, the active provider is used for chat.
- The chat window supports user messages, assistant messages, loading, retry, clear conversation, and close.

### FR-2: Session API-key setup

- Settings contains provider, model, masked API-key fields, and a `Connect & Activate` action.
- Settings lists all configured session providers and allows the user to activate or remove each one.
- The browser submits the key to the authenticated backend over HTTPS.
- The backend validates the key against the selected provider before marking it active.
- After successful submission, the raw key is not returned to the browser.
- The UI displays only `Connected for this session`, never the stored key.
- The user can remove the key manually.
- Logout removes the session key and the next login requires the key again.
- An expired/invalid provider key is removed; another configured provider becomes active when available.

### FR-3: Reply-only chat

- The backend sends only the user's typed question, permitted recent chat messages, and server-owned accounting instructions to the active provider.
- No application or database context is provided.
- The API response is displayed as text and optional structured examples.
- The response cannot cause an application-side action.

### FR-4: Accounting-only boundary

- The server performs an input scope check before returning a normal answer.
- The server supplies a non-user-editable accounting-only system instruction.
- The server performs an output scope check before displaying the response.
- Out-of-scope and prompt-injection requests receive a fixed response: `I can only assist with accounting, bookkeeping, and accounting-entry-related questions.`
- The assistant states that it cannot inspect company records when asked about actual balances, accounts, entries, reports, or database information.

### FR-5: Suggestion limit

- A response contains no more than five examples or suggestions.
- Every provider response schema defines a maximum of five suggestion items.
- The backend validates the schema and enforces the limit before returning a response.
- The UI also renders no more than five suggestion items as a final defensive control.

### FR-6: Short-term memory

- Up to 50 recent messages are held in browser session storage, not MongoDB.
- The client sends only the most recent messages with each request.
- Provider context is fixed at 12 messages, including the current question.
- Each message and the combined context have size limits; older messages are discarded first.
- The system prompt, API key, and hidden metadata are never accepted from chat history.
- Clear conversation and logout erase local chat memory.
- History survives a page refresh and is cleared on logout, explicit clear, or when the browser session ends.

### FR-7: Optional PDF reference mode (later phase)

- Only an administrator can select and upload approved accounting documents.
- PDFs may later be stored in an approved provider-supported or separately managed document collection, not the application database.
- Relevant PDF passages may be retrieved to ground accounting answers.
- PDF retrieval does not train or modify the selected model.
- Application records, client financial data, credentials, and unlicensed documents must not be uploaded.
- The feature remains reply-only and does not enable application or database access.

## 6. Recommended API-key session design

### Selected approach: backend in-memory session vault

1. The authenticated user selects Grok, Groq, or Gemini, selects a supported model, and enters that provider's key in Settings.
2. The browser sends it once to a dedicated backend endpoint over HTTPS.
3. The backend validates it and holds it in process memory under an opaque authenticated-session identifier.
4. Chat requests contain no API key; the backend looks up the active session provider and calls it.
5. The key is deleted on logout, manual disconnect, idle expiry, absolute expiry, or backend restart.

Recommended expiry defaults:

- Idle timeout: 30 minutes, refreshed by successful chat usage.
- Absolute timeout: no longer than the authenticated session, currently eight hours by default.

This design avoids MongoDB, `.env`, browser storage, and repeated transmission of the key. A backend process compromise could still expose keys held in memory, so memory handling, logging controls, HTTPS, dependency patching, and server access controls remain necessary.

### Deployment limitation

An in-memory vault works reliably only with one backend process/instance. Multiple workers or horizontally scaled instances require sticky routing or a shared encrypted ephemeral secret store. Until that infrastructure exists, deployment must use one FastAPI worker. A backend restart intentionally removes all provider keys and requires the user to enter them again.

### Rejected approaches

- `.env`: persists a shared key and does not meet the per-session requirement.
- MongoDB: persists a high-value secret and is unnecessary for this feature.
- `localStorage` or `sessionStorage`: exposes the raw key to browser JavaScript and XSS.
- React state with the key attached to every chat request: increases exposure and accidental logging risk.
- Direct browser-to-provider calls: exposes keys and bypasses server-enforced scope and output controls.

## 7. Non-functional and security requirements

- Never log API keys, authorization headers, full chat request bodies, or provider request payloads.
- Redact provider errors before returning them to the browser.
- Use HTTPS, authenticated routes, origin checks, request-size limits, and per-user rate limits.
- Apply a short provider timeout and bounded retries for transient errors only.
- Limit input length, response tokens, memory length, and suggestions to control cost.
- Never allow the client to supply `system`, `developer`, or `tool` messages.
- Do not enable provider web search, code execution, external tools, or application functions.
- Provide a clear notice that answers are educational suggestions and require professional/user review.
- Do not claim knowledge of the user's actual books because no application data is available.
- Clear in-memory keys during graceful shutdown where possible; rely on process-memory loss after termination.

## 8. Proposed API surface

- `POST /api/ai/session-key` - validate and retain the submitted key in memory.
- `GET /api/ai/session-key/status` - return only configured/valid/expiry status.
- `DELETE /api/ai/session-key` - remove the current session key.
- `PATCH /api/ai/session-key/active` - select a configured provider for chat.
- `DELETE /api/ai/session-key/{provider}` - remove one provider key and select the next available provider.
- `POST /api/ai/chat` - validate scope, call the active provider, validate output, and return a reply.
- Existing `POST /api/auth/logout` - also remove the current AI session key.

Indicative chat request:

```json
{
  "message": "How should office rent paid by bank be recorded?",
  "history": [
    {"role": "user", "content": "What is an expense account?"},
    {"role": "assistant", "content": "An expense account records costs..."}
  ]
}
```

Indicative response:

```json
{
  "in_scope": true,
  "answer": "Debit Rent Expense and credit Bank.",
  "suggestions": [],
  "disclaimer": "Review the treatment for your circumstances before recording it."
}
```

## 9. User flows

### First-time setup

1. User logs in.
2. The AI icon opens a setup guide because no provider is configured.
3. User opens Settings, selects a provider and model, and enters its API key.
4. The backend validates and retains the key in memory.
5. Settings shows `Connected for this session` and the AI icon becomes active.

### Chat

1. User selects the AI icon.
2. The chat window opens.
3. User submits an accounting question.
4. The backend enforces scope, sends bounded recent history to the active provider, and validates the reply.
5. The user receives an accounting response with at most five suggestions.

### Out-of-scope question

1. User submits a non-accounting or database-related question.
2. The scope gate rejects it.
3. The fixed accounting-only refusal is displayed.

### Logout

1. User logs out.
2. The server removes every configured AI provider key for that session.
3. Browser chat memory is cleared.
4. After the next login, the AI icon remains unconfigured until a key is entered again.

## 10. Acceptance criteria

- No provider API key is written to `.env`, MongoDB, browser storage, source control, or logs.
- Chat cannot be used until a key is configured for the current session.
- Logout makes the previous key unavailable immediately for that session.
- Restarting the backend removes all configured provider keys.
- The assistant refuses non-accounting and database/application-data questions.
- No request path can read or mutate application accounting data.
- No response contains more than five suggestions.
- No more than 12 recent messages, including the current question, are sent to the active provider.
- Chat and key endpoints require authentication and have dedicated rate limits.
- Tests cover multi-provider key lifecycle, active selection, logout cleanup, expiry, prompt injection, off-topic questions, history limits, suggestion limits, provider timeouts, and malformed responses.

## 11. Delivery plan

### Phase 1: Contract and security foundation

- Finalize allowed accounting topics and the fixed refusal language.
- Define request/response schemas and context-size limits.
- Implement the in-memory session-key vault with expiry and redacted logging.
- Add key setup, status, removal, and logout cleanup endpoints.
- Add unit and security tests for the key lifecycle.

### Phase 2: Multi-provider chat backend

- Add the authenticated Grok, Groq, and Gemini chat adapters.
- Add accounting-only input and output gates.
- Add server-owned instructions and structured output with a five-item limit.
- Add timeout, rate limiting, bounded retry, and error handling.
- Add tests using mocked provider clients; real API tests remain opt-in.

### Phase 3: User interface

- Add the top-navigation AI icon and configured/unconfigured states.
- Add the session key controls to Settings.
- Add the chat drawer/modal and browser-session history capped at 50 messages.
- Clear chat state during logout and handle key expiry gracefully.
- Add component and interaction tests.

### Phase 4: Verification and rollout

- Run backend and frontend test suites.
- Test at least 20 allowed questions and 20 refusal/prompt-injection cases.
- Verify that logs, browser storage, MongoDB, and network responses never expose the key.
- Deploy initially with one backend worker and monitor provider errors, latency, and usage without logging content.

### Phase 5: Optional approved-PDF references

- Define document ownership, review, versioning, and deletion rules.
- Select a provider-supported or separately managed document collection and upload approved accounting PDFs.
- Enable collection search only for accounting questions.
- Add source references and document-grounding tests.

## 12. Key risks and mitigations

| Risk | Mitigation |
| --- | --- |
| API key theft | HTTPS, backend-only memory, no logs/storage, expiry, dedicated provider keys, spending controls, rotation |
| Backend restart loses key | Expected session behavior; ask the user to reconnect |
| Multiple workers cannot share keys | Start with one worker; add an encrypted ephemeral shared store only when scaling |
| Prompt injection | Server-owned prompt, role allowlist, input/output gates, fixed refusal |
| Off-topic model response | Validate output and replace failures with the fixed refusal |
| Excess token usage | Bounded history, input limits, output-token cap, at most five suggestions, rate limits |
| Incorrect accounting advice | Clear disclaimer, no automatic actions, user/professional review |
| PDF contains harmful or irrelevant instructions | Administrator approval, document allowlist, retrieval isolation, output scope validation |
