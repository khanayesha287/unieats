
const { createClient } = require("@supabase/supabase-js");
const readline = require("node:readline/promises");
const { stdin, stdout } = require("node:process");

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Check .env.local without sharing its contents."
    );
  }

  const supabase = createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const rl = readline.createInterface({ input: stdin, output: stdout });

  try {
    const email = "rider.unieats@gmail.com";
    const password = await rl.question(
      "Enter the new password for the existing rider account: "
    );

    if (password.length < 12) {
      throw new Error("Use a password with at least 12 characters.");
    }

    const { data, error: listError } =
      await supabase.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });

    if (listError) throw listError;

    const matches = data.users.filter(
      (user) => user.email?.toLowerCase() === email
    );

    if (matches.length !== 1) {
      throw new Error(
        `Expected exactly one existing Auth user; found ${matches.length}. No password was changed.`
      );
    }

    const { error: updateError } =
      await supabase.auth.admin.updateUserById(matches[0].id, {
        password,
      });

    if (updateError) throw updateError;

    console.log(
      "Password updated successfully for the existing rider account."
    );
    console.log("Staff profile and driver mapping were not changed.");
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error("Password update failed:", error.message);
  process.exitCode = 1;
});
