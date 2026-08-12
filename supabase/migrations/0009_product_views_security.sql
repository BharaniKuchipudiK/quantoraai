-- Lock down product analytics views the same way as growth_daily / usage_daily.
-- Service-role reads still work; publishable keys cannot scrape engagement data.

alter view public.product_model_usage_7d set (security_invoker = on);
alter view public.product_mode_usage_7d set (security_invoker = on);
alter view public.product_domain_usage_7d set (security_invoker = on);
alter view public.product_choice_engagement_7d set (security_invoker = on);

revoke all on public.product_model_usage_7d from anon, authenticated;
revoke all on public.product_mode_usage_7d from anon, authenticated;
revoke all on public.product_domain_usage_7d from anon, authenticated;
revoke all on public.product_choice_engagement_7d from anon, authenticated;
