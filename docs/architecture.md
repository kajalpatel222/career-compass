# Career Copilot architecture

## Initial database choice: Prisma

Career Copilot starts with Prisma because its schema-first workflow gives us a clear, reviewable model for the small relational domain and a type-safe client for application code. It also keeps migrations explicit as the product grows.

The first schema intentionally includes only `User`, `CandidateProfile`, `Job`, `JobAnalysis`, and `Application`. Email, contacts, tasks, and calendar events will be added only when their vertical slices are ready.

## AI configuration

OpenRouter model configuration will be centralized in application code. Job analysis will use LangChain structured output with runtime validation; model responses will never be accepted as unvalidated prose.
