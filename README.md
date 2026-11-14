# Roskiolimpiades

Plataforma web per gestionar totes les competicions de les Roskiolimpiades.

## Arquitectura

- **Inici:** accés al catàleg de jocs i resum de l'activitat.
- **Classificació general:** rànquing individual acumulat entre totes les edicions.
- **Jocs:** catàleg extensible de competicions; el billar Bola 8 és el primer joc.
- **Participants:** registre global compartit per tots els tornejos.
- **Gestió:** accés privat d'organitzador per mantenir participants, jocs i equips.

## Puntuació general

- 1r lloc: 3 punts.
- 2n lloc: 2 punts.
- 3r lloc: 1 punt.
- Els empats comparteixen la suma dels punts de les posicions ocupades.
- La classificació històrica acumula els punts de totes les edicions.
- En tornejos per equips, els punts de l'equip s'assignen individualment a cada membre inscrit en aquell torneig. No hi ha classificació general d'equips.

## Dades i seguretat

La base de dades Supabase està preparada amb:
- Edicions, jocs, participants i equips.
- Tornejos, inscripcions i premis.
- Rànquings individuals històrics i per edició.
- Rodes, partides, participants de cada partida i descansos.
- RLS activat a totes les taules exposades.
- Lectura pública per als marcadors i classificacions.
- Escriptura reservada a usuaris autenticats amb `app_metadata.role = 'admin'`.
- Supabase Realtime activat per actualitzar les vistes públiques.

**No s'ha d'exposar mai cap clau `service_role` ni cap secret al navegador.** El frontend utilitza exclusivament la publishable key.

## Configuració local

Copia `.env.example` a `.env.local` i configura:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Després:

```bash
npm install
npm run dev
```

## Crear l'accés d'organitzador

1. Crea un usuari a Supabase Authentication > Users.
2. Assigna-li el rol privat d'organitzador a `app_metadata` amb una operació administrativa des de Supabase:

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
where email = 'CORREU_DE_L_ORGANITZADOR';
```

3. Inicia sessió a l'apartat **Gestió** de l'aplicació.

No hi ha registre públic. Els participants no necessiten comptes per consultar les classificacions.

## Estat de la sincronització

La plataforma global, les classificacions, el catàleg de jocs i el registre global de participants llegeixen Supabase i escolten canvis en temps real. El mòdul actual de billar conserva encara el seu estat de partides a l'emmagatzematge local del navegador; les taules genèriques de rondes i partides ja estan creades per completar la sincronització del torneig en el següent pas.
