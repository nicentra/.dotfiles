set nocompatible              " be iMproved, required 
filetype off                  " required

" set the runtime path to include Vundle and initialize
set rtp+=~/.vim/bundle/Vundle.vim
call vundle#begin()
" alternatively, pass a path where Vundle should install plugins
"call vundle#begin('~/some/path/here')

" let Vundle manage Vundle, required
Plugin 'VundleVim/Vundle.vim'
Plugin 'chriskempson/base16-vim'
Plugin 'lervag/vimtex'
Plugin 'Valloric/YouCompleteMe'
Plugin 'dag/vim-fish'
Plugin 'scrooloose/nerdtree'
call vundle#end()            " required
filetype plugin indent on    " required
" To ignore plugin indent changes, instead use:
"filetype plugin on
"
" Brief help
" :PluginList       - lists configured plugins
" :PluginInstall    - installs plugins; append `!` to update or just :PluginUpdate
" :PluginSearch foo - searches for foo; append `!` to refresh local cache
" :PluginClean      - confirms removal of unused plugins; append `!` to auto-approve removal
"
" see :h vundle for more details or wiki for FAQ
" Put your non-Plugin stuff after this line
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

autocmd BufWritePost config.h,config.def.h !sudo make clean install
autocmd BufWritePost *BINFO_Thesis/*.tex silent! lcd ~/git/BINFO_Thesis | silent! execute '!pdflatex thesis.tex' | silent! lcd %:p:h
autocmd BufWritePost *.Xresources !xrdb -load ~/.Xresources 
" autocmd vimenter * NERDTree
" autocmd bufenter * if (winnr("$") == 1 && exists("b:NERDTree") && b:NERDTree.isTabTree()) | q | endif

if filereadable(expand("~/.vimrc_background"))
  let base16colorspace=256
  source ~/.vimrc_background
endif

highlight Normal ctermbg=NONE
highlight NonText ctermbg=NONE
