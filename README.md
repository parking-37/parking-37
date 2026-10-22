# Parking 37

Reparto justo de la plaza de parking #37 (in) entre Sendoa y Mikel. Cada uno marca qué días va la semana que viene y, cuando coincidís, la web decide de forma automática a quién le toca, llevando la cuenta de los solapes que se ha llevado cada uno.

**Web:** https://parking-37.github.io/parking-37/

## Cómo funciona

- **Previsión:** se marca en la pestaña «Próxima» y se puede cambiar hasta el domingo a las 23:59 (hora de Madrid). Cuando empieza la semana, la previsión queda cerrada.
- **Solapes:** si los dos pedís el mismo día, se lo lleva quien menos solapes haya ganado. Si vais empatados, gana quien no ganó el último (el primero de todos fue para Mikel). Así la diferencia nunca pasa de 1.
- **Cambios de planes:** en «Esta semana», quien tiene la plaza puede cederla («Cederla a…»: cuenta como un solape ganado por el otro) o decir que ya no va. En ese caso pasa al otro si la había pedido, y cuenta igual que una cesión; si no la había pedido, queda libre.
- **Festivos:** cualquiera puede marcar un día, de hoy en adelante, como festivo. Ese día no se reparte ni cuenta.

## Puesta en marcha

Los datos viven en el repo privado `parking-37/parking-37-data`; esta web es pública pero no contiene ningún dato. Para que el token fine-grained de cada uno llegue a ese repo, los dos repos están en una organización de GitHub en la que los dos sois miembros.

1. **Organización:** crear una organización gratuita (`parking-37`) en https://github.com/account/organizations/new e invitar a `mirastorza` como miembro.
2. **Tokens fine-grained en la organización:** en *Settings › Personal access tokens* de la organización, permitir el acceso con tokens fine-grained. Si se deja la aprobación del administrador, aprobar la solicitud de Mikel cuando llegue.
3. **Repos:** `parking-37/parking-37` (público, esta web) y `parking-37/parking-37-data` (privado, con `data/state.json`). Mikel necesita permiso de escritura en `parking-37-data`.
4. **Pages:** en `parking-37`, *Settings › Pages*, publicar desde la rama `main`, carpeta `/`.
5. **Token de cada uno** (Sendoa y Mikel, cada uno el suyo): en https://github.com/settings/personal-access-tokens/new
   - *Resource owner:* `parking-37`
   - *Repository access:* solo `parking-37-data`
   - *Permissions › Contents:* Read and write
   - *Expiration:* la que se quiera (como mucho un año). Cuando caduque, la web pedirá uno nuevo.
6. Abrir la web en el móvil, pegar el token y, si se quiere, «Añadir a pantalla de inicio».

## Código

Sin dependencias ni paso de build.

- `asignacion.js`: el algoritmo de reparto y las semanas ISO (Europe/Madrid). No toca la red, así que sirve igual para la web que para una futura Action de avisos.
- `cambios.js`: lo que puede hacer cada usuario (previsión, cesión, «ya no voy», festivo) y sus plazos.
- `github.js`: lectura y escritura de `state.json` con la API de contenidos. Si los dos guardáis a la vez, relee, vuelve a aplicar tu cambio y reintenta una vez.
- `index.html`: la interfaz.

Tests (Node 20 o superior):

```sh
node --test test/
```
