-- Prisma keeps the list of applied migrations in "_prisma_migrations", a table
-- it creates itself in the public schema, so no earlier migration covers it.
-- Supabase exposes public tables through its REST API, so deny all access
-- through that API, as for the app's own tables. With RLS on and no policies,
-- only roles that bypass RLS (the table's owner, which is the role that runs
-- the migrations) can read or write it. Safe to run again.
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
