set nocompatible              " be iMproved, required 
filetype off                  " required

syntax enable
filetype plugin on
set splitright
set splitbelow
set tabstop=4
set softtabstop=4
set number
set relativenumber
set showmatch
set incsearch
set hlsearch
set autochdir
set clipboard="+
set grepprg=grep\ -nH\ $*

let g:tex_flavor = "latex"

vmap <C-c> "+yi
vmap <C-x> "+c
vmap <C-v> c<ESC>"+p
imap <C-v> <C-r><C-o>+
map <C-n> :NERDTreeToggle<CR>
map <S-t> :tab split<CR>
map <S-Tab> :tabn<CR>
map <A-Tab> :tabp<CR>

nnoremap <C-Left> :vertical resize +2<CR>
nnoremap <C-Right> :vertical resize -2<CR>
nnoremap <C-Up> :resize +2<CR>
nnoremap <C-Down> :resize -2<CR>

if filereadable(expand("~/.vimrc_background"))
  let base16colorspace=256
  source ~/.vimrc_background
endif

highlight Normal ctermbg=NONE
highlight NonText ctermbg=NONE