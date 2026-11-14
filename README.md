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

## Crear l’accés d’organitzador

El primer compte està autoritzat exclusivament per a `xavialmirall4@gmail.com`. Des de **Gestió**, introdueix aquest correu i una contrasenya i prem **Crear el meu compte d’organitzador**. Si Supabase demana confirmació, obre el correu i confirma l’adreça; després inicia sessió. Un trigger privat de la base de dades assigna el rol `app_metadata.role = admin` només a aquest correu. No hi ha registre públic general. Els participants no necessiten comptes per consultar les classificacions.

## Estat de sincronització

El mòdul de billar desa inscripcions, rondes, partides, resultats, descansos i podi a Supabase. Les vistes públiques s’actualitzen amb Supabase Realtime. La classificació general es recalcula a partir dels podis publicats.
