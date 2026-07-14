# TODO

## Fix 401 Unauthorized en licitaciones
- [ ] Revisar auth header/tipo de token entre frontend y backend
- [ ] Ajustar mismatch de claims en JWT (`sub` vs `user_id`) si aplica
- [ ] Confirmar estructura esperada por `get_current_user` y `get_current_user(me)`
- [ ] Revisar endpoint `/api/licitaciones` y el scoping por `empresa_id`
- [ ] Eliminar cualquier referencia a “contrumater” (si existe) en código relacionado
- [ ] Probar flujo completo: Login -> /licitaciones list -> explorer

