# Row Level Security - Putzplan

## Security Model

**Principle:** Household-based data isolation
- Users can ONLY access data from their own household
- Cross-household access is completely blocked
- RLS is Defense-in-Depth (even if Frontend bypassed, DB enforces)

## Helper Functions

### `get_user_household_id(uuid)`
- **Type:** SECURITY DEFINER
- **Purpose:** Bypass RLS recursion in household_members policies
- **Why:** Cannot query household_members IN household_members policy (infinite loop)
- **Security:** Safe because function only returns household_id for given user_id
- **Source:** [20251026000001_rls_policies.sql](migrations/20251026000001_rls_policies.sql)

```sql
CREATE OR REPLACE FUNCTION get_user_household_id(user_uuid UUID)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT household_id
  FROM household_members
  WHERE user_id = user_uuid
  LIMIT 1;
$$;
```

## Policies Overview

### households (4 policies)

| Operation | Allowed To | Condition | Reason |
|-----------|-----------|-----------|--------|
| SELECT | All authenticated | `true` | Invite-code lookup before joining |
| INSERT | All authenticated | `true` | User registration flow |
| UPDATE | Household members | Member check | Name/settings changes |
| DELETE | Household members | Member check | ⚠️ ANY member can delete! Consider admin-role |

**Security Consideration: Public SELECT**
- Allows ANY authenticated user to read ALL household names
- Necessary for invite-flow (lookup before membership)
- Safe: tasks/members have strict RLS, households table has no sensitive data
- Only exposed: household_id, name, invite_code

### household_members (4 policies)

| Operation | Allowed To | Condition | Reason |
|-----------|-----------|-----------|--------|
| SELECT | Same household | `get_user_household_id()` | See other members |
| INSERT | Self | `user_id = auth.uid()` | Join via invite code |
| UPDATE | Self | `user_id = auth.uid()` | Update display_name |
| DELETE | Self | `user_id = auth.uid()` | Leave household |

**Key Insight:** Uses SECURITY DEFINER helper to avoid recursion!

### tasks (4 policies)

| Operation | Allowed To | Condition | Reason |
|-----------|-----------|-----------|--------|
| SELECT | Household members | `household_id IN (...)` | View household tasks |
| INSERT | Household members | `household_id IN (...)` | Create tasks |
| UPDATE | Household members | `household_id IN (...)` | ⚠️ ANY member can edit ANY task |
| DELETE | Household members | `household_id IN (...)` | ⚠️ ANY member can delete ANY task |

**Design Decision: Communal Ownership**
- Tasks have NO creator/owner tracking
- ALL household members have equal permissions
- Alternative: Add `created_by` + role-system for permission control

### task_completions (3 policies)

| Operation | Allowed To | Condition | Reason |
|-----------|-----------|-----------|--------|
| SELECT | Household members | 2-hop: task → household | View completion history |
| INSERT | Household members | Task ownership + `user_id = auth.uid()` | Create completion |
| DELETE | Completion owner | `user_id = auth.uid()` | Delete own completion |
| UPDATE | - | NOT PERMITTED | History is immutable |

**Design Decision: Deletable Completions**
- Users CAN delete own completions (error correction)
- Risk: Stats manipulation
- Alternative: Soft-delete with `deleted_at` column

## Performance

### Indexes for RLS
See: [20251026000000_consolidated_schema.sql](migrations/20251026000000_consolidated_schema.sql)

Key indexes:
- `idx_household_members_user_household` - Composite index for RLS subqueries
- `idx_tasks_household_id` - Tasks filtered by household
- All FK-indexes for JOIN performance

### Best Practices Applied
✅ Always specify role: `TO authenticated` (prevents unnecessary 'anon' checks)
✅ Use `(SELECT auth.uid())` wrapper (enables query optimization - initPlan caching)
✅ SECURITY DEFINER for helper functions (bypass RLS safely)
✅ SET search_path for SECURITY DEFINER (prevents search_path attacks)
✅ Composite indexes for subquery patterns

**Example: initPlan Optimization**
```sql
-- ❌ Bad: auth.uid() evaluated for EACH row
USING (auth.uid() = user_id)

-- ✅ Good: auth.uid() evaluated ONCE (initPlan)
USING ((SELECT auth.uid()) = user_id)
```

## Testing

Run security tests:
```bash
npx supabase test db supabase/tests/rls_security_tests.sql
```

Expected: All 7 tests pass ✅

Tests verify:
1. Cross-household task access blocked
2. Own household task access works
3. Cross-household task creation blocked
4. Cross-household member visibility blocked
5. Cross-household completion deletion blocked
6. User can delete own completion
7. Public household SELECT works (invite lookup)

## Security Audit Checklist

- [x] RLS enabled on all tables
- [x] Policies use `TO authenticated` (not `TO public`)
- [x] SECURITY DEFINER functions use `SET search_path`
- [x] No recursive RLS queries (uses helper function)
- [x] Composite indexes for RLS subqueries
- [x] Cross-household isolation tested
- [x] Public SELECT justified (invite-code lookup)
- [ ] Admin role for household delete (future)
- [ ] Immutable completions (future)

## Future Improvements

- [ ] **Admin role** for household (delete/settings restricted to creator)
- [ ] **Task creator tracking** (for permission granularity: only creator can delete)
- [ ] **Immutable completions** (remove DELETE policy, add soft-delete)
- [ ] **Audit log** for sensitive operations (household delete, member kick)
- [ ] **Rate limiting** on task creation (prevent spam)

---

**Last Updated:** 2025-10-26
**Migration:** 20251026000001_rls_policies.sql
**Tests:** supabase/tests/rls_security_tests.sql
