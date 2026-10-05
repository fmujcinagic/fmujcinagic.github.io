FROM jekyll/jekyll:4

COPY Gemfile Gemfile.lock /srv/jekyll/
RUN bundle install

RUN gem install webrick --no-document
# rebuild