COLORS=("-amber" "-blue" "-blue-grey" "-brown" "-cyan" "-deep-orange" "-deep-purple" "-green" "-grey" "-indigo" "-light-blue" "-light-green" "-lime" "-orange" "-pink" "-purple" "-red" "-teal" "-yellow")
for c in ${COLORS[*]};
do
		echo $c
		~/.config/polybar/scripts/colors-dark.sh $c;
		sleep 2;
done;
