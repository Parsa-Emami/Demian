<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Throwable;

/**
 * Staff provisioning is a CLI-only administrative action; no browser signup,
 * shared cashier credentials or plaintext password flags in shell history.
 */
final class ArcadeCashierStaffCommand extends Command
{
    protected $signature = 'arcade:cashier:staff
        {action : create|disable|enable|reset-password|set-role}
        {--username= : Normalized account login}
        {--display-name= : Display name, for create}
        {--branch= : Branch identifier, for create}
        {--role=cashier : cashier|manager|admin|super_admin}
        {--ack-super-admin : Explicit high-privilege offline role confirmation}
        {--apply : Confirm administrative change}';

    protected $description = 'Provision or revoke separate in-cafe staff accounts securely.';

    public function handle(): int
    {
        $action = (string) $this->argument('action');
        $username = strtolower((string) $this->option('username'));
        if (! $this->option('apply') || ! in_array($action, [
            'create', 'disable', 'enable', 'reset-password', 'set-role',
        ], true) || ! preg_match('/^[a-z][a-z0-9._-]{2,63}$/D', $username)) {
            $this->error('Require valid action, --username and explicit --apply.');
            return self::FAILURE;
        }

        try {
            // Never keep a database transaction open while prompting a human.
            $hashedPassword = in_array($action, ['create', 'reset-password'], true)
                ? $this->securePassword() : null;
            $result = DB::transaction(function () use ($action, $username, $hashedPassword): string {
                $staff = DB::table('arcade_cashier_staff')
                    ->where('username', $username)->lockForUpdate()->first();
                $now = now()->utc()->toDateTimeString();
                if ($action === 'create') {
                    if ($staff) throw new \RuntimeException('Account exists.');
                    $branch = (string) $this->option('branch');
                    $name = trim((string) $this->option('display-name'));
                    $role = (string) $this->option('role');
                    if (! preg_match('/^[a-zA-Z0-9_-]{2,40}$/D', $branch)
                        || $name === '' || mb_strlen($name) > 100
                        || ! \App\Services\Arcade\CafeAccess::knownRole($role)
                        || ($role === 'super_admin' && ! $this->option('ack-super-admin'))) {
                        throw new \InvalidArgumentException('Invalid branch/role/display-name.');
                    }
                    $hash = $hashedPassword;
                    $id = DB::table('arcade_cashier_staff')->insertGetId([
                        'username' => $username, 'display_name' => $name,
                        'password_hash' => $hash, 'branch_id' => $branch,
                        'role' => $role, 'is_active' => true,
                        'session_version' => 1, 'created_at' => $now,
                        'updated_at' => $now,
                    ]);
                    $this->recordEvent($id, 'staff_created', ['role' => $role,
                        'branch' => $branch]);
                    return 'created #'.$id;
                }
                if (! $staff) throw new \RuntimeException('Staff account not found.');
                if ($staff->role === 'super_admin'
                    && in_array($action, ['disable', 'set-role'], true)) {
                    // The last active root operator must never be locked out.
                    $activeRoots = DB::table('arcade_cashier_staff')
                        ->where('role', 'super_admin')->where('is_active', true)
                        ->orderBy('id')->lockForUpdate()->get();
                    if (count($activeRoots) <= 1) {
                        throw new \RuntimeException('Cannot modify the last active super administrator.');
                    }
                    if (! $this->option('ack-super-admin')) {
                        throw new \RuntimeException('Explicit super admin confirmation required.');
                    }
                }
                $updates = ['updated_at' => $now, 'session_version' => $staff->session_version + 1];
                if ($action === 'disable') {
                    $updates['is_active'] = false;
                } elseif ($action === 'enable') {
                    $updates['is_active'] = true;
                } elseif ($action === 'set-role') {
                    $role = (string) $this->option('role');
                    if (! \App\Services\Arcade\CafeAccess::knownRole($role)
                        || ($role === 'super_admin' && ! $this->option('ack-super-admin'))) {
                        throw new \InvalidArgumentException('Unknown or unconfirmed role.');
                    }
                    $updates['role'] = $role;
                } else {
                    $updates['password_hash'] = $hashedPassword;
                }
                DB::table('arcade_cashier_staff')->where('id', $staff->id)->update($updates);
                $this->recordEvent((int) $staff->id, 'cli_'.$action, [
                    'old_role' => $staff->role, 'new_role' => $updates['role'] ?? $staff->role,
                    'branch' => $staff->branch_id,
                ]);
                return $action.' #'.$staff->id;
            }, 3);
            $this->info('Cashier account '.$result.'. Existing sessions invalidated on changes.');
            return self::SUCCESS;
        } catch (Throwable) {
            $this->error('Account operation failed; confirm unique username and secure input.');
            return self::FAILURE;
        }
    }

    private function recordEvent(int $subjectId, string $event, array $details): void
    {
        // actor_id=null denotes a trusted shell/SSH operation, not a web user.
        DB::table('arcade_cashier_admin_events')->insert([
            'actor_id' => null, 'subject_id' => $subjectId, 'event_type' => $event,
            'details' => json_encode($details, JSON_THROW_ON_ERROR),
            'created_at' => now(),
        ]);
    }

    private function securePassword(): string
    {
        $first = $this->secret('New password (hidden, at least 12 chars)');
        $second = $this->secret('Confirm new password');
        if (! is_string($first) || strlen($first) < 12 || strlen($first) > 128
            || ! preg_match('/[A-Z]/', $first) || ! preg_match('/[a-z]/', $first)
            || ! preg_match('/[0-9]/', $first)
            || ! is_string($second) || ! hash_equals($first, $second)) {
            throw new \InvalidArgumentException('Password policy or confirmation failed.');
        }
        return Hash::make($first);
    }
}
