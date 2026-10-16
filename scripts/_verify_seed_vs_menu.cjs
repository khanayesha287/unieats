async function main() {
  const [{ strict: assert }, { readFile, readdir }, path, tsModule] = await Promise.all([
    import("node:assert"),
    import("node:fs/promises"),
    import("node:path"),
    import("typescript"),
  ]);
  const ts = tsModule.default ?? tsModule;
  const root = path.join(__dirname, "..");
  const [menusSource, seedSource] = await Promise.all([
    readFile(path.join(root, "lib/data/menus.ts"), "utf8"),
    readFile(
      path.join(
        root,
        "supabase-migrations/20261015005000_seed_student_menu_catalogue.sql",
      ),
      "utf8",
    ),
  ]);

  const javascript = ts.transpileModule(menusSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const loadedModule = { exports: {} };
  new Function("exports", "require", "module", javascript)(
    loadedModule.exports,
    () => ({}),
    loadedModule,
  );

  const menuItems = loadedModule.exports.menuItems;
  assert.ok(Array.isArray(menuItems), "frontend menu catalogue was not loaded");
  const expected = menuItems
    .map((item) => ({
      catalogue_key: item.id,
      canteen_slug: item.canteenSlug,
      name: item.name,
      price: item.price,
      available: item.available,
      sizes: item.sizes ?? {},
      add_ons: item.addOns ?? [],
      image_url: item.image,
    }))
    .sort((left, right) =>
      left.catalogue_key.localeCompare(right.catalogue_key, "en"),
    );

  const payload = seedSource.match(
    /\$catalogue\$\s*([\s\S]*?)\s*\$catalogue\$::jsonb/,
  );
  assert.ok(payload, "catalogue seed JSON payload was not found");
  const seeded = JSON.parse(payload[1]);

  assert.equal(
    new Set(expected.map((item) => item.catalogue_key)).size,
    expected.length,
    "frontend catalogue keys must be unique",
  );
  assert.deepEqual(
    seeded,
    expected,
    "seed payload differs from the frontend catalogue",
  );
  assert.equal(seeded.length, 203, "unexpected official catalogue item count");

  const batchDirectory = path.join(
    root,
    "supabase-migrations/student-menu-seed-batches",
  );
  const batchFiles = (await readdir(batchDirectory))
    .filter((filename) => /^\d{2}_seed_menu_items\.sql$/.test(filename))
    .sort();
  assert.deepEqual(
    batchFiles,
    [
      "01_seed_menu_items.sql",
      "02_seed_menu_items.sql",
      "03_seed_menu_items.sql",
      "04_seed_menu_items.sql",
      "05_seed_menu_items.sql",
    ],
    "expected five numbered seed batches",
  );
  const batchSql = await Promise.all(
    batchFiles.map((filename) =>
      readFile(path.join(batchDirectory, filename), "utf8"),
    ),
  );
  const batchRecords = batchSql.flatMap((sql, index) => {
    assert.ok(sql.startsWith(`-- UniEats canonical menu seed, batch ${String(index + 1).padStart(2, "0")} of 05.`));
    assert.ok(/^BEGIN;/m.test(sql), `${batchFiles[index]} must begin a transaction`);
    assert.ok(/^COMMIT;/m.test(sql), `${batchFiles[index]} must commit its transaction`);
    assert.ok(sql.includes("WHERE NOT EXISTS ("), `${batchFiles[index]} must insert missing keys only`);
    assert.ok(sql.includes("conflicting catalogue key data"), `${batchFiles[index]} must reject conflicts`);
    assert.ok(!/UPDATE\s+public\.menu_items|DELETE\s+FROM\s+public\.menu_items|TRUNCATE|DISABLE\s+ROW\s+LEVEL\s+SECURITY|GRANT\s/i.test(sql));
    const payload = sql.match(
      /\$batch_catalogue\$\s*([\s\S]*?)\s*\$batch_catalogue\$::jsonb/,
    );
    assert.ok(payload, `${batchFiles[index]} is missing its catalogue payload`);
    return JSON.parse(payload[1]);
  });
  assert.deepEqual(
    batchRecords,
    expected,
    "numbered batch payloads differ from the frontend catalogue",
  );
  assert.deepEqual(
    batchSql.map((sql) => JSON.parse(sql.match(
      /\$batch_catalogue\$\s*([\s\S]*?)\s*\$batch_catalogue\$::jsonb/,
    )[1]).length),
    [41, 41, 41, 40, 40],
    "unexpected batch sizes",
  );

  const counts = new Map();
  for (const item of seeded) {
    counts.set(item.canteen_slug, (counts.get(item.canteen_slug) ?? 0) + 1);
  }
  console.log(
    `Verified ${batchRecords.length} unique menu keys across ${batchFiles.length} ordered batches: ${[...counts]
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([slug, count]) => `${slug}=${count}`)
      .join(", ")}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});