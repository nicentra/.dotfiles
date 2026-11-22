" Plain vim, for servers and machines without neovim. No plugins.
set nocompatible

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
set grepprg=grep\ -nH\ $*

let g:tex_flavor = "latex"

" System clipboard (needs a vim built with +clipboard)
vmap <C-c> "+yi
vmap <C-x> "+c
vmap <C-v> c<ESC>"+p
imap <C-v> <C-r><C-o>+

map <S-t> :tab split<CR>
map <S-Tab> :tabn<CR>
map <A-Tab> :tabp<CR>

nnoremap <C-Left> :vertical resize +2<CR>
nnoremap <C-Right> :vertical resize -2<CR>
nnoremap <C-Up> :resize +2<CR>
nnoremap <C-Down> :resize -2<CR>

highlight Normal ctermbg=NONE
highlight NonText ctermbg=NONE
