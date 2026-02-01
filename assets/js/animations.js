export const animarEntradaFluxo = (ativa, emPausa, isUpdate = false) => {
    const rowPausa = document.querySelector('.row');
    const btnRetornar = document.querySelector('.btn-retornar');

    if (ativa) {
        // Remove .none dos containers principais
        document.querySelectorAll('.controles, .home-content, .bottom-nav, .telefone')
                .forEach(el => el?.classList.remove('none'));

        // Só faz o "Pop" inicial se não for um simples update de estado
        if (!isUpdate) {
            gsap.fromTo(['.telefone', '.card-principal', '.carrossel', '.nav-item'], 
                { scale: 0.8, opacity: 0 },
                { scale: 1, opacity: 1, duration: 0.4, stagger: 0.05, ease: "back.out(1.5)" }
            );
        }

        // Troca entre linha de pausa e botão de retorno
        if (emPausa) {
            rowPausa?.classList.add('none');
            btnRetornar?.classList.remove('none');
            gsap.fromTo(btnRetornar, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3 });
        } else {
            btnRetornar?.classList.add('none');
            rowPausa?.classList.remove('none');
            gsap.fromTo(rowPausa, { y: -10, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3 });
        }
    } else {
        document.querySelectorAll('.controles, .home-content, .bottom-nav, .telefone').forEach(el => el?.classList.add('none'));
    }
};
