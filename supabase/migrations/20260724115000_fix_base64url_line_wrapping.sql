create or replace function public.base64url_encode(p_value bytea)
returns text
language sql
immutable
as $$
  select rtrim(translate(replace(replace(encode(p_value, 'base64'), E'\r', ''), E'\n', ''), '+/', '-_'), '=');
$$;