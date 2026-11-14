# Roskiolimpiades · Bola 8

Aplicació web responsive per organitzar un torneig de billar americà Bola 8 en format americana: parelles rotatives, descansos equilibrats i classificació individual.

## Funcions de la primera versió

- Alta de participants i sorteig de partides 2 contra 2.
- Una sola taula: quatre participants juguen cada ronda i la resta descansen.
- Sorteig que intenta evitar repetir companys i rivals i prioritza qui ha descansat menys.
- Resultats per parella, victòria individual per als dos membres i regla de derrota per negra prematura.
- Classificació per victòries, diferència de boles i boles a favor.
- Historial i anul·lació de l'últim resultat.

## Desenvolupament

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Estat actual

La primera versió guarda l'estat al navegador del dispositiu (`localStorage`). La connexió de dades compartides amb Supabase, el codi d'accés de participants i el control d'organitzador s'han de completar abans d'utilitzar-la com a tauler compartit de torneig.
