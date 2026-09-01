"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseAuth } from "@/lib/supabase-auth";
import type { Role, StaffProfile } from "@/lib/auth";
import { getRoleBadge, getRoleBadgeColor } from "@/lib/auth";

interface CanteenOption {
  id: number | string;
  name: string;
}

interface StaffFormData {
  email: string;
  password: string;
  name: string;
  role: Role;
  canteen_id: string;
}

const EMPTY_FORM: StaffFormData = {
  email: "",
  password: "",
  name: "",
  role: "canteen_owner",
  canteen_id: "",
};

const ROLES: { value: Role; label: string }[] = [
  { value: "canteen_owner", label: "Canteen Owner" },
  { value: "driver", label: "Driver" },
];

export default function StaffManagement() {
  const [staff, setStaff] = useState<StaffProfile[]>([]);
  const [canteens, setCanteens] = useState<CanteenOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<StaffFormData>(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!supabaseAuth) return;
    setIsLoading(true);

    const [staffResult, canteensResult] = await Promise.all([
      supabaseAuth
        .from("staff_profiles")
        .select("id, email, name, role, canteen_id, active")
        .order("created_at", { ascending: false }),
      supabaseAuth.from("canteens").select("id, name"),
    ]);

    if (staffResult.error) {
      console.error("[Staff] Fetch error:", staffResult.error.message);
      setError("Failed to load staff data.");
    }

    const staffData = (staffResult.data ?? []).map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role as Role,
      canteen_id: row.canteen_id ?? null,
      active: row.active,
    }));

    setStaff(staffData);
    setCanteens(
      (canteensResult.data ?? []).map((r) => ({
        id: r.id,
        name: r.name,
      })),
    );
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleCreate = async () => {
    if (!supabaseAuth) return;
    if (!form.email || !form.password || !form.name) {
      setError("Name, email, and password are required.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    // Create auth user
    const { data: authData, error: authError } = await supabaseAuth.auth.signUp({
      email: form.email,
      password: form.password,
    });

    if (authError || !authData.user) {
      setError(authError?.message ?? "Failed to create user.");
      setIsSubmitting(false);
      return;
    }

    // Create staff profile
    const { error: profileError } = await supabaseAuth.from("staff_profiles").insert({
      id: authData.user.id,
      email: form.email,
      name: form.name,
      role: form.role,
      canteen_id:
        form.role === "canteen_owner" && form.canteen_id
          ? Number(form.canteen_id)
          : null,
      active: true,
    });

    if (profileError) {
      setError("User created but profile failed: " + profileError.message);
      setIsSubmitting(false);
      return;
    }

    setForm(EMPTY_FORM);
    setShowForm(false);
    setIsSubmitting(false);
    void loadData();
  };

  const handleUpdate = async (staffMember: StaffProfile, updates: Partial<StaffProfile>) => {
    if (!supabaseAuth) return;
    setError(null);

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (updates.name !== undefined) updatePayload.name = updates.name;
    if (updates.role !== undefined) updatePayload.role = updates.role;
    if (updates.active !== undefined) updatePayload.active = updates.active;
    if (updates.canteen_id !== undefined) updatePayload.canteen_id = updates.canteen_id;

    const { error: updateError } = await supabaseAuth
      .from("staff_profiles")
      .update(updatePayload)
      .eq("id", staffMember.id);

    if (updateError) {
      setError("Update failed: " + updateError.message);
      return;
    }

    void loadData();
  };

  const toggleActive = async (staffMember: StaffProfile) => {
    await handleUpdate(staffMember, { active: !staffMember.active });
  };

  const canteenName = (canteenId: string | number | null | undefined): string => {
    if (!canteenId) return "\u2014";
    return canteens.find((c) => String(c.id) === String(canteenId))?.name ?? "Unknown";
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-900">Staff Management</h3>
          <p className="mt-0.5 text-xs text-slate-500">Only administrators can create and manage staff access.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowForm(!showForm);
            setForm(EMPTY_FORM);
            setEditingId(null);
          }}
          className="rounded-full bg-violet-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-violet-700"
        >
          {showForm ? "Cancel" : "+ Add Staff"}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <h4 className="mb-1 text-sm font-bold text-slate-700">Add Staff Member</h4>
          <p className="mb-3 text-xs text-slate-500">Create a new staff account. The staff member will use these credentials to log in.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              type="text"
              placeholder="Full name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-400"
            />
            <input
              type="email"
              placeholder="Email address"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-400"
            />
            <input
              type="password"
              placeholder="Temporary password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-400"
            />
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-400"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            {form.role === "canteen_owner" && (
              <select
                value={form.canteen_id}
                onChange={(e) => setForm({ ...form, canteen_id: e.target.value })}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-400 sm:col-span-2"
              >
                <option value="">Select canteen...</option>
                {canteens.map((c) => (
                  <option key={String(c.id)} value={String(c.id)}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <button
            type="button"
            onClick={handleCreate}
            disabled={isSubmitting}
            className="mt-3 rounded-full bg-violet-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:opacity-50"
          >
            {isSubmitting ? "Sending Invitation..." : "Send Invitation"}
          </button>
        </div>
      )}

      {/* Staff list */}
      {isLoading ? (
        <p className="text-sm text-slate-500">Loading staff...</p>
      ) : staff.length === 0 ? (
        <p className="text-sm text-slate-500">
          No staff users found. Create the first admin account via Supabase dashboard.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Canteen</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {staff.map((s) => (
                <tr key={s.id} className={!s.active ? "opacity-50" : ""}>
                  <td className="px-4 py-3 font-medium text-slate-900">{s.name}</td>
                  <td className="px-4 py-3 text-slate-600">{s.email}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold " +
                        getRoleBadgeColor(s.role)
                      }
                    >
                      {getRoleBadge(s.role)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {s.role === "canteen_owner" ? canteenName(s.canteen_id) : "\u2014"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold " +
                        (s.active
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-red-100 text-red-700")
                      }
                    >
                      {s.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => toggleActive(s)}
                      className={
                        "rounded-full px-3 py-1 text-xs font-semibold transition " +
                        (s.active
                          ? "bg-red-50 text-red-600 hover:bg-red-100"
                          : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100")
                      }
                    >
                      {s.active ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
