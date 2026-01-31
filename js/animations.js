// js/animations.js

export const animarEntradaFluxo = (ativa, emPausa) => {
    // Seletores dos containers do seu HTML
    const controles = document.querySelector('.controles');
    const homeContent = document.querySelector('.home-content');
    const bottomNav = document.querySelector('.bottom-nav');
    
    // Elementos internos
    const telefone = document.querySelector('.telefone');
    const rowPausa = document.querySelector('.row');
    const btnRetornar = document.querySelector('.btn-retornar');
    const pauseSelect = document.querySelector('#pause-type');
    const pauseBtn = document.querySelector('.btn-pausa');

    if (ativa) {
        // 1. Revela containers (Remove display: none)
        [controles, homeContent, bottomNav, telefone].forEach(el => el?.classList.remove('none'));

        const tl = gsap.timeline();

        // 2. Animação Pop Satisfatória
        tl.fromTo(['.telefone', '.card-principal', '.carrossel', '.nav-item'], 
            { scale: 0.5, opacity: 0 },
            { 
                scale: 1, 
                opacity: 1, 
                duration: 0.5, 
                stagger: 0.1, 
                ease: "back.out(1.7)",
                clearProps: "all" 
            }
        );

        // 3. Controle da linha de Pausa
        if (emPausa) {
            rowPausa?.classList.add('none');
            btnRetornar?.classList.remove('none');
            tl.fromTo(btnRetornar, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, ease: "back.out(2)" }, "-=0.3");
        } else {
            btnRetornar?.classList.add('none');
            rowPausa?.classList.remove('none');
            [pauseSelect, pauseBtn].forEach(el => el?.classList.remove('none'));
            
            tl.fromTo([pauseSelect, pauseBtn], 
                { scale: 0, opacity: 0 }, 
                { scale: 1, opacity: 1, stagger: 0.1, ease: "back.out(1.5)" }, 
                "-=0.3"
            );
        }
    } else {
        // 4. Esconde tudo ao encerrar jornada
        [controles, homeContent, bottomNav, btnRetornar, rowPausa].forEach(el => {
            el?.classList.add('none');
        });
    }
};
